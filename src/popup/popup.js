const $ = (id) => document.getElementById(id);

let tabId = null;
let entry = null;
let spinTimer = 0;

const level = (pct) => (pct > 90 ? 'crit' : pct >= 80 ? 'warn' : 'ok');

// same as content.js, popup is a separate page so it cannot share that scope
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

function ago(ms) {
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
}

function setRow(id, card) {
    const node = $(id);
    const ok = card && Number.isFinite(card.percent);
    const pct = ok ? Math.min(100, Math.max(0, card.percent)) : null;
    node.dataset.level = pct === null ? 'ok' : level(pct);
    node.querySelector('.pct').textContent = pct === null ? '--' : `${pct}%`;
    node.querySelector('.fill').style.width = `${pct ?? 0}%`;
    const left = fmtLeft(card && card.resetAt);
    node.querySelector('.reset').textContent = left ? `⏱ ${left}` : '';
}

function render() {
    const has = !!(entry && entry.data);
    $('data').hidden = !has;
    $('empty').hidden = has;
    $('tier').hidden = !has || !entry.data.tier || entry.data.tier === '--';
    if (!has) return;
    $('tier').textContent = entry.data.tier;
    setRow('session', entry.data.session);
    setRow('weekly', entry.data.weekly);
    $('updated').textContent = `Updated ${ago(entry.updatedAt)}`;
}

function startSpin() {
    $('refresh').classList.add('spin');
    clearTimeout(spinTimer);
    spinTimer = setTimeout(stopSpin, 12000);
}

function stopSpin() {
    clearTimeout(spinTimer);
    $('refresh').classList.remove('spin');
}

async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;

    const { showRing = true } = await chrome.storage.local.get('showRing');
    $('showRing').checked = showRing;

    if (tabId !== null && tab.url?.startsWith('https://gemini.google.com/')) {
        const key = `usage:${tabId}`;
        const res = await chrome.storage.session.get(key);
        entry = res[key] || null;
    }
    render();
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || tabId === null) return;
    const change = changes[`usage:${tabId}`];
    if (!change) return;
    entry = change.newValue || null;
    render();
    stopSpin();
});

$('showRing').addEventListener('change', (e) => {
    chrome.storage.local.set({ showRing: e.target.checked });
});

$('refresh').addEventListener('click', () => {
    if (tabId === null) return;
    startSpin();
    chrome.tabs.sendMessage(tabId, { type: 'refresh' })
        .then((res) => { if (!res || !res.ok) stopSpin(); })
        .catch(stopSpin);
});

setInterval(render, 30000);
init();
