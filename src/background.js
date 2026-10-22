const COLORS = { ok: '#4c96ff', warn: '#ffa629', crit: '#ff5449' };

function level(pct) {
    if (pct > 90) return 'crit';
    return pct >= 80 ? 'warn' : 'ok';
}

// only the service worker can set the badge, content scripts cannot
chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== 'usage' || !sender.tab) return;
    const tabId = sender.tab.id;
    const data = msg.data;
    const pct = data && data.session ? data.session.percent : null;

    chrome.action.setBadgeText({ tabId, text: pct === null ? '' : `${pct}%` });
    if (pct !== null) chrome.action.setBadgeBackgroundColor({ tabId, color: COLORS[level(pct)] });

    const key = `usage:${tabId}`;
    if (data) chrome.storage.session.set({ [key]: { data, updatedAt: Date.now() } });
    else chrome.storage.session.remove(key);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(`usage:${tabId}`);
});
