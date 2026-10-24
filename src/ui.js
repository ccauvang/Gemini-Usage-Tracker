(() => {
    const NS = (window.GUT = window.GUT || {});
    const ROOT_ID = 'gut-usage';

    // dom api only, no innerHTML - gemini may enforce trusted types
    const createElement = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    function chevron() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', 'gut-chev');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M7 10l5 5 5-5');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.append(path);
        return svg;
    }

    function row(key, label) {
        const root = createElement('div', 'gut-row');
        root.dataset.key = key;
        const top = createElement('div', 'gut-row-top');
        const left = createElement('div', 'gut-row-left');
        left.append(createElement('span', 'gut-label', label), createElement('span', 'gut-pct', '--'));
        top.append(left, createElement('span', 'gut-reset'));
        const track = createElement('div', 'gut-track');
        track.append(createElement('div', 'gut-fill'));
        root.append(top, track);
        return root;
    }

    function buildPanel() {
        const panel = createElement('div', 'gut-panel');
        panel.append(createElement('span', 'gut-tier', '--'), row('session', 'Session:'), row('weekly', 'Weekly:'));
        return panel;
    }

    function build() {
        const root = createElement('section');
        root.id = ROOT_ID;
        root.dataset.open = 'true';

        const head = createElement('button', 'gut-head');
        head.type = 'button';
        head.setAttribute('aria-expanded', 'true');
        head.append(createElement('span', 'gut-title', 'Usage'), chevron());
        head.addEventListener('click', () => {
            const open = root.dataset.open !== 'true';
            root.dataset.open = String(open);
            head.setAttribute('aria-expanded', String(open));
        });

        const collapse = createElement('div', 'gut-collapse');
        const body = createElement('div', 'gut-body');
        const inner = createElement('div', 'gut-inner');
        inner.append(buildPanel());
        body.append(inner);
        collapse.append(body);

        root.append(head, collapse);
        return root;
    }

    const RING_ID = 'gut-ring';
    const RING_R = 26;
    const CIRC = 2 * Math.PI * RING_R;

    function percentOf(data) {
        if (!data || !Number.isFinite(data.percent)) return null;
        return Math.min(100, Math.max(0, data.percent));
    }

    function level(pct) {
        if (pct === null) return 'ok';
        if (pct > 90) return 'crit';
        return pct >= 80 ? 'warn' : 'ok';
    }

    function svg(tag, attrs) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const key in attrs) node.setAttribute(key, attrs[key]);
        return node;
    }

    function buildRing() {
        const root = createElement('div');
        root.id = RING_ID;
        root.dataset.level = 'ok';

        const arc = svg('circle', { class: 'gut-ring-arc', cx: 36, cy: 36, r: RING_R, transform: 'rotate(-90 36 36)' });
        arc.style.strokeDasharray = `0 ${CIRC}`;

        const time = svg('text', { class: 'gut-ring-time', x: 36, y: 36 });
        time.textContent = '--';

        const mark = svg('g', { class: 'gut-ring-mark' });
        mark.append(
            svg('line', { x1: 36, y1: 6, x2: 36, y2: 14 }),
            svg('polygon', { points: '36,4.5 33.5,1 38.5,1' })
        );

        const box = svg('svg', { viewBox: '0 0 72 72', 'aria-hidden': 'true' });
        box.append(svg('circle', { class: 'gut-ring-track', cx: 36, cy: 36, r: RING_R }), arc, time, mark);
        const tip = createElement('div', 'gut-ring-tip');
        tip.append(
            createElement('div', 'gut-tip-session', 'Session: --'),
            createElement('div', 'gut-tip-weekly', 'Weekly: --'),
            createElement('div', 'gut-tip-reset', 'Reset at: --')
        );
        root.append(box, tip);
        return root;
    }

    // exact local time - date only when reset is not today
    function fmtAt(ts) {
        if (!ts) return '--';
        const d = new Date(ts);
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === new Date().toDateString()) return time;
        return `${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} ${time}`;
    }

    function renderRing(data) {
        const root = document.getElementById(RING_ID);
        if (!root) return;
        const session = data && data.session;
        const sp = percentOf(session);
        const wp = percentOf(data && data.weekly);
        root.dataset.level = level(sp);
        root.querySelector('.gut-ring-arc').style.strokeDasharray = `${(CIRC * (sp ?? 0)) / 100} ${CIRC}`;
        root.querySelector('.gut-ring-time').textContent = (session && session.reset) || '--';
        root.querySelector('.gut-tip-session').textContent = `Session: ${sp === null ? '--' : `${sp}%`}`;
        root.querySelector('.gut-tip-weekly').textContent = `Weekly: ${wp === null ? '--' : `${wp}%`}`;
        root.querySelector('.gut-tip-reset').textContent = `Reset at: ${fmtAt(session && session.resetAt)}`;
        const mark = root.querySelector('.gut-ring-mark');
        mark.style.display = wp === null ? 'none' : '';
        mark.style.transform = `rotate(${(wp ?? 0) * 3.6}deg)`;
    }

    function setRow(root, key, data) {
        const node = root.querySelector(`.gut-row[data-key="${key}"]`);
        const pct = percentOf(data);
        node.dataset.level = level(pct);
        node.querySelector('.gut-pct').textContent = pct === null ? '--' : `${pct}%`;
        node.querySelector('.gut-fill').style.width = `${pct ?? 0}%`;
        const reset = data && data.reset;
        node.querySelector('.gut-reset').textContent = reset ? `⏱ ${reset}` : '';
    }

    // data = { tier, session: { percent, reset }, weekly: { percent, reset } }, null = empty state
    function render(data) {
        renderRing(data);
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        root.querySelector('.gut-tier').textContent = (data && data.tier) || '--';
        setRow(root, 'session', data && data.session);
        setRow(root, 'weekly', data && data.weekly);
    }

    NS.ui = { build, buildRing, render, id: ROOT_ID };
})();
