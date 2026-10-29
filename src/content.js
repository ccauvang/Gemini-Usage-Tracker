const GAP = 12;
const RING_SIZE = 64;
const CHAT_ROUTE = /^(\/u\/\d+)?\/app(\/|$)/;
const POLL_MS = 500;
const TIMEOUT_MS = 5000;
const MIN_GAP_MS = 15000;
const REPLY_DEBOUNCE_MS = 2500;
const TIER_GRACE_MS = 5000;
const RPC_TIMEOUT_MS = 6000;

let last = null;
let ring = null;
let observed = null;
let queued = false;
let busy = false;
let lastRun = 0;
let lastPath = '';
let wasGenerating = false;
let replyTimer = 0;
let showRing = true;
let expiredFor = 0;
let rerun = false;
let tier = null;
let tierMissSince = 0;
let rpcSeq = 0;


const pending = new Map();

const resizeObserver = new ResizeObserver(() => schedule());

const onChat = () => CHAT_ROUTE.test(location.pathname);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const VI_DAYS = {
    'chủ nhật': 0,
    'thứ hai': 1,
    'thứ ba': 2,
    'thứ tư': 3,
    'thứ năm': 4,
    'thứ sáu': 5,
    'thứ bảy': 6
};
const DAY_MS = 86400000;

// "Resets at 6:19 PM" / "Resets Oct 22 at 2:19 PM" / "Resets Mon at 2:19 PM" / "Đặt lại vào 28 thg 10 lúc 14:53" to a Date
function resetDate(text) {
    // vietnamese accents can arrive decomposed, normalize so the patterns match
    text = text.normalize('NFC');
    const time = text.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm|sa|ch)(?!\p{L}))?/iu);
    if (!time) return null;
    let hour = Number(time[1]);
    const meridiem = (time[3] || '').toLowerCase();
    if ((meridiem === 'pm' || meridiem === 'ch') && hour < 12) hour += 12;
    if ((meridiem === 'am' || meridiem === 'sa') && hour === 12) hour = 0;

    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, Number(time[2]));

    const en = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
    const vi = text.match(/(\d{1,2})\s*(?:thg|tháng)\s*(\d{1,2})/i);
    const monthDay = en ? [MONTHS.indexOf(en[1].toLowerCase()), Number(en[2])] : vi ? [Number(vi[2]) - 1, Number(vi[1])] : null;

    const wdEn = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    const wdVi = text.toLowerCase().match(/chủ nhật|thứ (?:hai|ba|tư|năm|sáu|bảy)/);
    const weekday = wdEn ? DAYS.indexOf(wdEn[1].toLowerCase()) : wdVi ? VI_DAYS[wdVi[0]] : -1;

    if (monthDay) {
        date.setMonth(monthDay[0], monthDay[1]);
        // text has no year, so a date far in the past means next year
        if (date.getTime() < now.getTime() - 180 * DAY_MS) date.setFullYear(date.getFullYear() + 1);
    } else if (/tomorrow|ngày mai/i.test(text)) {
        date.setDate(date.getDate() + 1);
    } else if (weekday >= 0) {
        date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
        // grace window for backend lag -- avoid pushing just-expired weekly reset +7d ahead
        if (now.getTime() - date.getTime() > 5 * 60000) date.setDate(date.getDate() + 7);
    } else if (date <= now) {
        // grace window for clock drift / backend lag -- do not push recent past time +24h ahead
        if (now.getTime() - date.getTime() > 5 * 60000) {
            date.setDate(date.getDate() + 1);
        }
    }
    return date;
}

// timestamp to "3h 53m" / "1d 8h" / "12m"
function fmtLeft(resetAt) {
    if (!resetAt) return '';
    const mins = Math.max(0, Math.ceil((resetAt - Date.now()) / 60000));
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// scrape data keeps resetAt, ui wants the text, so convert right before render
function view(data) {
    if (!data) return null;
    const side = (c) => ({ percent: c.percent, reset: fmtLeft(c.resetAt), resetAt: c.resetAt });
    return { tier: data.tier, session: side(data.session), weekly: side(data.weekly) };
}

function parse(doc) {
    const container = doc.querySelector('.usage-metrics-container');
    const tierText = (doc.querySelector('.tier-pill')?.textContent || '').trim();

    const card = (id) => {
        const node = doc.querySelector(`[data-test-id="${id}"]`);
        if (!node) return null;
        const match = node.textContent.match(/(\d+)\s*%/);
        if (!match) return null;
        const text = node.querySelector('[class*="reset-time"]')?.textContent || '';
        const date = resetDate(text);
        if (text && !date) console.warn('[gut] reset text not parsed:', text);
        return { percent: Number(match[1]), resetAt: date ? date.getTime() : null };
    };

    const session = card('gxu-currently');
    const weekly = card('gxu-weekly');
    if (!container || !session || !weekly) return null;
    return { tier: tierText.split(/\s+/).pop() || '--', session, weekly };
}

// label renders late (angular), so a missing label only means free after a grace period
function currentTier() {
    const label = document.querySelector('.mavatar-tier-label');
    const text = label ? label.textContent.trim() : '';
    if (text) {
        tierMissSince = 0;
        tier = text;
        return tier;
    }
    if (!tierMissSince) tierMissSince = Date.now();
    if (Date.now() - tierMissSince > TIER_GRACE_MS) tier = 'Free';
    return tier;
}

function publish(data) {
    last = data;
    data.tier = currentTier() || data.tier;
    GUT.ui.render(view(data));
    try {
        chrome.runtime.sendMessage({ type: 'usage', data }).catch(() => { });
    } catch {
        // extension was reloaded while this tab stayed open, old script is orphaned
    }
}

function diagnose(doc) {
    if (!doc) return 'no document';
    const missing = ['.usage-metrics-container', '[data-test-id="gxu-currently"]', '[data-test-id="gxu-weekly"]']
        .filter((selector) => !doc.querySelector(selector));
    return missing.length ? `missing ${missing.join(', ')}` : 'selectors found but percent not read';
}


window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const msg = ev.data;
    if (!msg || msg.source !== 'gut-injector' || msg.type !== 'usage_result') return;
    const done = pending.get(msg.id);
    if (!done) return;
    pending.delete(msg.id);
    done(msg);
})

// ask the main world injector for the usage rpc, resolves null on any failure so scrape can fall back
function fetchRows() {
    return new Promise((resolve) => {
        const id = ++rpcSeq;
        const timer = setTimeout(() => {
            pending.delete(id);
            console.warn('[gut] rpc timeout');
            resolve(null);
        }, RPC_TIMEOUT_MS);
        pending.set(id, (msg) => {
            clearTimeout(timer);
            if (msg.error) console.warn('[gut] rpc failed:', msg.error);
            resolve(msg.error ? null : msg.payload);
        });
        window.postMessage({ source: 'gut-cs', type: 'fetch_usage', id }, location.origin);
    })
}

// row order differs between calls, so key on the unit field (1 = session, 2 = weekly), not position
function parseRows(payload) {
    const list = Array.isArray(payload && payload[1]) ? payload[1] : [];
    const rows = list.filter(Array.isArray).map((r) => ({
        percent: Math.round(Number(r[1]) * 100),
        unit: r[2],
        resetAt: r[3] && r[3][0] ? r[3][0][0] * 1000 : null
    }));
    const session = rows.find((r) => r.unit === 1);
    const weekly = rows.find((r) => r.unit === 2);
    if (!session || !weekly) return null;
    if (!Number.isFinite(session.percent) || !Number.isFinite(weekly.percent)) return null;
    const side = (r) => ({ percent: r.percent, resetAt: r.resetAt });
    // tier is not in the rpc, publish() fills it from the page label
    return { tier: null, session: side(session), weekly: side(weekly) };
}

function scrape(force = false) {
    if (!chrome.runtime?.id || !onChat()) return;
    // queue forced refresh if scrape already running -- avoids dropping post-reply refresh
    if (busy) {
        if (force) rerun = true;
        return;
    }
    const now = Date.now();
    if (!force && now - lastRun < MIN_GAP_MS) return;
    busy = true;
    lastRun = now;

    // rpc first, iframe only when rpc fails or rows are unreadable
    fetchRows().then((payload) => {
        const data = parseRows(payload);
        if (!data) return scrapeFrame(now);
        busy = false;
        publish(data);
        if (rerun) {
            rerun = false;
            scrape(true);
        }
    });
}

function scrapeFrame(now) {
    const base = (location.pathname.match(/^\/u\/\d+/) || [''])[0];
    const frame = document.createElement('iframe');
    // real size offscreen, a 0x0 frame can stop angular from rendering
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;pointer-events:none';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.src = `${base}/usage?_t=${now}`;

    const finish = (data) => {
        clearInterval(poll);
        frame.remove();
        busy = false;
        if (data) publish(data); // fail = keep last good numbers
        if (rerun) { rerun = false; scrape(true); }
    };

    const poll = setInterval(() => {
        let data = null;
        try {
            data = frame.contentDocument && parse(frame.contentDocument);
        } catch {
            // cross-origin means we got redirected away, treat as not ready
        }
        // wait for reset text, but not forever - 0% usage may have none
        const settled = data && ((data.session.resetAt && data.weekly.resetAt) || Date.now() - now > 3000);
        if (settled) {
            finish(data);
        } else if (Date.now() - now > TIMEOUT_MS) {
            let why = 'blocked or redirected';
            try {
                why = diagnose(frame.contentDocument);
            } catch {
                // cross-origin, keep the default text
            }
            console.warn('[gut] scrape timeout:', why);
            finish(null);
        }
    }, POLL_MS);

    document.body.append(frame);
}

// match stop icon instead of aria-label -- works across all UI languages (en "Stop", vi "Ngừng")
const isGenerating = () => !!document.querySelector('button:has(mat-icon[fonticon="stop"])');

// percent is stale once a reset time passes, refresh once per reset time so a bad parse cannot loop
function checkExpired() {
    if (!last || document.hidden) return;
    const due = [last.session.resetAt, last.weekly.resetAt].filter((t) => t && t <= Date.now());
    if (!due.length) return;
    const key = Math.max(...due);
    if (key === expiredFor) return;
    expiredFor = key;
    scrape(true);
}

function watchReply() {
    const now = isGenerating();
    if (wasGenerating && !now) {
        clearTimeout(replyTimer);
        replyTimer = setTimeout(() => scrape(true), REPLY_DEBOUNCE_MS);
    }
    if (now) clearTimeout(replyTimer);
    wasGenerating = now;
}

// angular can wipe, recreate or reorder nodes, so tick re-mounts AND re-positions
function mountSidebar() {
    const anchor =
        document.querySelector('expandable-section[storagekey="notebooks"]') ||
        document.querySelector('expandable-section');
    if (!anchor) return;

    const node = document.getElementById(GUT.ui.id);
    if (node) {
        // already right under anchor, no-op (also stops 500ms churn)
        if (anchor.nextElementSibling === node) return;
        // wrong spot, move same node (keeps open/closed state)
        anchor.after(node);
        return;
    }
    anchor.after(GUT.ui.build());
    GUT.ui.render(view(last));
}

function ensureRing() {
    if (ring && ring.isConnected) return ring;
    ring = GUT.ui.buildRing();
    ring.hidden = true;
    document.body.append(ring);
    GUT.ui.render(view(last));
    return ring;
}

function place() {
    // pending frame can fire after orphan cleanup (hidden tab pauses rAF) - do not rebuild the ring
    if (!chrome.runtime?.id) return;
    // fieldset class is stable, inner text-input-field classes change while typing
    const box = document.querySelector('fieldset.input-area-fieldset');
    if (box !== observed) {
        if (observed) resizeObserver.unobserve(observed);
        if (box) resizeObserver.observe(box);
        observed = box;
    }
    const node = ensureRing();
    if (!box || !onChat() || !showRing) {
        node.hidden = true;
        return;
    }
    const rect = box.getBoundingClientRect();
    node.style.color = getComputedStyle(box).color;
    const fits = rect.width > 0 && rect.right + GAP + RING_SIZE <= window.innerWidth;
    node.hidden = !fits;
    node.style.left = `${rect.right + GAP}px`;
    node.style.top = `${rect.bottom - RING_SIZE}px`;
}

function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        place();
    });
}

function tick() {
    if (!chrome.runtime?.id) {
        // extension reloaded -- kill timers and observers so old script stops touching dom
        clearInterval(tickTimer);
        clearInterval(renderTimer);
        resizeObserver.disconnect();
        window.removeEventListener('resize', schedule);
        ring?.remove();
        document.getElementById(GUT.ui.id)?.remove();
        return;
    }
    if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        scrape();
    }
    if (onChat()) {
        mountSidebar();
    } else {
        const node = document.getElementById(GUT.ui.id);
        if (node) node.remove();
    }
    watchReply();
    const t = currentTier();
    if (last && t && t !== last.tier) publish(last);
    schedule();
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scrape();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'refresh') {
        if (!onChat()) {
            sendResponse({ ok: false });
            return;
        }
        scrape(true);
        sendResponse({ ok: true });
    }
});

chrome.storage.local.get('showRing').then((res) => {
    showRing = res.showRing !== false;
    schedule();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.showRing) return;
    showRing = changes.showRing.newValue !== false;
    schedule();
});

window.addEventListener('resize', schedule);
const renderTimer = setInterval(() => {
    GUT.ui.render(view(last));
    checkExpired();
}, 30000);
const tickTimer = setInterval(tick, POLL_MS);
