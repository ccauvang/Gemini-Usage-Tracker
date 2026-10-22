const GAP = 12
const RING_SIZE = 64
const CHAT_ROUTE = /^(\/u\/\d+)?\/app(\/|$)/
const POLL_MS = 500
const TIMEOUT_MS = 10000
const MIN_GAP_MS = 15000
const REPLY_DEBOUNCE_MS = 2500

let last = null
let ring = null
let observed = null
let queued = false
let busy = false
let lastRun = 0
let lastPath = ''
let wasGenerating = false
let replyTimer = 0
let showRing = true
let expiredFor = 0

const resizeObserver = new ResizeObserver(() => schedule())

const onChat = () => CHAT_ROUTE.test(location.pathname)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_MS = 86400000

// "Resets at 6:19 PM" / "Resets Oct 22 at 2:19 PM" / "Resets Mon at 2:19 PM" to a Date
function resetDate(text) {
    const time = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
    if (!time) return null
    let hour = Number(time[1])
    const meridiem = (time[3] || '').toLowerCase()
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0

    const now = new Date()
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, Number(time[2]))
    const md = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i)
    const wd = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i)

    if (md) {
        date.setMonth(MONTHS.indexOf(md[1].toLowerCase()), Number(md[2]))
        // text has no year, so a date far in the past means next year
        if (date.getTime() < now.getTime() - 180 * DAY_MS) date.setFullYear(date.getFullYear() + 1)
    } else if (/tomorrow/i.test(text)) {
        date.setDate(date.getDate() + 1)
    } else if (wd) {
        const target = DAYS.indexOf(wd[1].toLowerCase())
        date.setDate(date.getDate() + ((target - date.getDay() + 7) % 7))
        if (date <= now) date.setDate(date.getDate() + 7)
    } else if (date <= now) {
        date.setDate(date.getDate() + 1)
    }
    return date
}

// timestamp to "3h 53m" / "1d 8h" / "12m"
function fmtLeft(resetAt) {
    if (!resetAt) return ''
    const mins = Math.max(0, Math.ceil((resetAt - Date.now()) / 60000))
    const d = Math.floor(mins / 1440)
    const h = Math.floor((mins % 1440) / 60)
    const m = mins % 60
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

// scrape data keeps resetAt, ui wants the text, so convert right before render
function view(data) {
    if (!data) return null
    const side = (c) => ({ percent: c.percent, reset: fmtLeft(c.resetAt) })
    return { tier: data.tier, session: side(data.session), weekly: side(data.weekly) }
}

function parse(doc) {
    const container = doc.querySelector('.usage-metrics-container')
    const tierText = (doc.querySelector('.tier-pill')?.textContent || '').trim()

    const card = (id) => {
        const node = doc.querySelector(`[data-test-id="${id}"]`)
        if (!node) return null
        const match = node.textContent.match(/(\d+)\s*%/)
        if (!match) return null
        const text = node.querySelector('[class*="reset-time"]')?.textContent || ''
        const date = resetDate(text)
        if (text && !date) console.warn('[gut] reset text not parsed:', text)
        return { percent: Number(match[1]), resetAt: date ? date.getTime() : null }
    }

    const session = card('gxu-currently')
    const weekly = card('gxu-weekly')
    if (!container || !session || !weekly) return null
    return { tier: tierText.split(/\s+/).pop() || '--', session, weekly }
}

function publish(data) {
    last = data
    GUT.ui.render(view(data))
    try {
        chrome.runtime.sendMessage({ type: 'usage', data }).catch(() => { })
    } catch {
        // extension was reloaded while this tab stayed open, old script is orphaned
    }
}

function diagnose(doc) {
    if (!doc) return 'no document'
    const missing = ['.usage-metrics-container', '[data-test-id="gxu-currently"]', '[data-test-id="gxu-weekly"]']
        .filter((selector) => !doc.querySelector(selector))
    return missing.length ? `missing ${missing.join(', ')}` : 'selectors found but percent not read'
}

function scrape(force = false) {
    const now = Date.now()
    if (busy || !onChat()) return
    if (!force && now - lastRun < MIN_GAP_MS) return
    busy = true
    lastRun = now

    const base = (location.pathname.match(/^\/u\/\d+/) || [''])[0]
    const frame = document.createElement('iframe')
    // real size offscreen, a 0x0 frame can stop angular from rendering
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;pointer-events:none'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.src = `${base}/usage?_t=${now}`

    const finish = (data) => {
        clearInterval(poll)
        frame.remove()
        busy = false
        publish(data)
    }

    const poll = setInterval(() => {
        let data = null
        try {
            data = frame.contentDocument && parse(frame.contentDocument)
        } catch {
            // cross-origin means we got redirected away, treat as not ready
        }
        if (data) {
            console.log('[gut] scrape ok', data)
            finish(data)
        } else if (Date.now() - now > TIMEOUT_MS) {
            let why = 'blocked or redirected'
            try {
                why = diagnose(frame.contentDocument)
            } catch {
                // cross-origin, keep the default text
            }
            console.warn('[gut] scrape timeout:', why)
            finish(null)
        }
    }, POLL_MS)

    document.body.append(frame)
}

// guess: stop button has an aria-label containing "stop", send me its dom if reply trigger never fires
const isGenerating = () => !!document.querySelector('button[aria-label*="stop" i]')

// percent is stale once a reset time passes, refresh once per reset time so a bad parse cannot loop
function checkExpired() {
    if (!last || document.hidden) return
    const due = [last.session.resetAt, last.weekly.resetAt].filter((t) => t && t <= Date.now())
    if (!due.length) return
    const key = Math.max(...due)
    if (key === expiredFor) return
    expiredFor = key
    scrape(true)
}

function watchReply() {
    const now = isGenerating()
    if (wasGenerating && !now) {
        clearTimeout(replyTimer)
        replyTimer = setTimeout(() => scrape(true), REPLY_DEBOUNCE_MS)
    }
    if (now) clearTimeout(replyTimer)
    wasGenerating = now
}

// angular can wipe or recreate nodes on navigation, so tick re-mounts
function mountSidebar() {
    if (document.getElementById(GUT.ui.id)) return
    const anchor =
        document.querySelector('expandable-section[storagekey="notebooks"]') ||
        document.querySelector('expandable-section');
    if (!anchor) return
    anchor.after(GUT.ui.build())
    GUT.ui.render(view(last))
}

function ensureRing() {
    if (ring && ring.isConnected) return ring
    ring = GUT.ui.buildRing()
    ring.hidden = true
    document.body.append(ring)
    GUT.ui.render(view(last))
    return ring
}

function place() {
    // fieldset class is stable, inner text-input-field classes change while typing
    const box = document.querySelector('fieldset.input-area-fieldset')
    if (box !== observed) {
        if (observed) resizeObserver.unobserve(observed)
        if (box) resizeObserver.observe(box)
        observed = box
    }
    const node = ensureRing()
    if (!box || !onChat() || !showRing) {
        node.hidden = true
        return
    }
    const rect = box.getBoundingClientRect()
    const fits = rect.width > 0 && rect.right + GAP + RING_SIZE <= window.innerWidth
    node.hidden = !fits
    node.style.left = `${rect.right + GAP}px`
    node.style.top = `${rect.bottom - RING_SIZE}px`
}

function schedule() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
        queued = false
        place()
    })
}

function tick() {
    if (location.pathname !== lastPath) {
        lastPath = location.pathname
        scrape()
    }
    if (onChat()) {
        mountSidebar()
    } else {
        const node = document.getElementById(GUT.ui.id)
        if (node) node.remove()
    }
    watchReply()
    schedule()
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scrape()
})

chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'refresh') scrape(true)
})

chrome.storage.local.get('showRing').then((res) => {
    showRing = res.showRing !== false
    schedule()
})

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.showRing) return
    showRing = changes.showRing.newValue !== false
    schedule()
})

window.addEventListener('resize', schedule)
setInterval(() => {
    GUT.ui.render(view(last))
    checkExpired()
}, 30000)
setInterval(tick, POLL_MS)