(() => {
    const NS = (window.GUT = window.GUT || {})
    const ROOT_ID = 'gut-usage'

    // dom api only, no innerHTML — gemini may enforce trusted types
    const createElement = (tag, cls, text) => {
        const node = document.createElement(tag)
        if (cls) node.className = cls
        if (text !== undefined) node.textContent = text
        return node
    }

    function chevron() {
        const ns = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(ns, 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('class', 'gut-chev')
        svg.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS(ns, 'path')
        path.setAttribute('d', 'M7 10l5 5 5-5')
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', 'currentColor')
        path.setAttribute('stroke-width', '1.8')
        path.setAttribute('stroke-linecap', 'round')
        path.setAttribute('stroke-linejoin', 'round')
        svg.append(path)
        return svg
    }

    function row(key, label) {
        const root = createElement('div', 'gut-row')
        root.dataset.key = key
        const top = createElement('div', 'gut-row-top')
        const left = createElement('div', 'gut-row-left')
        left.append(createElement('span', 'gut-label', label), createElement('span', 'gut-pct', '--'))
        top.append(left, createElement('span', 'gut-reset'))
        const track = createElement('div', 'gut-track')
        track.append(createElement('div', 'gut-fill'))
        root.append(top, track)
        return root
    }

    function buildPanel() {
        const panel = createElement('div', 'gut-panel')
        panel.append(createElement('span', 'gut-tier', '--'), row('session', 'Session:'), row('weekly', 'Weekly:'))
        return panel
    }

    function build() {
        const root = createElement('section')
        root.id = ROOT_ID
        root.dataset.open = 'true'

        const head = createElement('button', 'gut-head')
        head.type = 'button'
        head.setAttribute('aria-expanded', 'true')
        head.append(createElement('span', 'gut-title', 'Usage'), chevron())
        head.addEventListener('click', () => {
            const open = root.dataset.open !== 'true'
            root.dataset.open = String(open)
            head.setAttribute('aria-expanded', String(open))
        })

        const collapse = createElement('div', 'gut-collapse')
        const body = createElement('div', 'gut-body')
        const inner = createElement('div', 'gut-inner')
        inner.append(buildPanel())
        body.append(inner)
        collapse.append(body)

        root.append(head, collapse)
        return root
    }

    function setRow(root, key, data) {
        const node = root.querySelector(`.gut-row[data-key="${key}"]`)
        const ok = data && Number.isFinite(data.percent)
        const pct = ok ? Math.min(100, Math.max(0, data.percent)) : null
        node.querySelector('.gut-pct').textContent = pct === null ? '--' : `${pct}%`
        node.querySelector('.gut-fill').style.width = `${pct ?? 0}%`
        const reset = data && data.reset
        node.querySelector('.gut-reset').textContent = reset ? `⏱ ${reset}` : ''
    }

    // data = { tier, session: { percent, reset }, weekly: { percent, reset } }, null = empty state
    function render(data) {
        const root = document.getElementById(ROOT_ID)
        if (!root) return
        root.querySelector('.gut-tier').textContent = (data && data.tier) || '--'
        setRow(root, 'session', data && data.session)
        setRow(root, 'weekly', data && data.weekly)
    }

    NS.ui = { build, render, id: ROOT_ID }
})()