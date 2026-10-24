// runs in gemini's MAIN world at document_start, no chrome.* api here.
// content script asks over postMessage, we call the same usage rpc the /usage page uses
// and hand back the raw payload. tokens only exist in the page's own js world, which is why this file exists.
(() => {
    if (window.__gutInjected) return;
    window.__gutInjected = true;

    const RPC = 'jSf9Qc';
    const OUT = 'gut-injector';
    const IN = 'gut-cs';
    const TIMEOUT_MS = 8000;

    const send = (type, payload) => {
        try {
            window.postMessage({ source: OUT, type, ...payload }, location.origin);
        } catch {
            // page tearing down, nothing to do
        }
    }

    // keep /u/N so multi account calls hit the right user, same as the page does
    const prefix = () => (location.pathname.match(/^\/u\/\d+/) || [''])[0];

    // body is ")]}'" then length-prefixed json lines, result envelope is ["wrb.fr", rpcid, payloadJson, ..., errorStatus?]
    function parse(text) {
        for (const line of String(text).split('\n')) {
            const s = line.trim();
            if (!s.startsWith('[')) continue;
            let arr;
            try {
                arr = JSON.parse(s);
            } catch {
                continue;
            }
            if (!Array.isArray(arr)) continue;
            for (const env of arr) {
                if (!Array.isArray(env) || env[0] !== 'wrb.fr' || env[1] !== RPC) continue;
                if (Array.isArray(env[5])) throw new Error(`rpc_${env[5][0]}`);
                if (typeof env[2] !== 'string') throw new Error('empty_payload');
                return JSON.parse(env[2]);
            }
        }
        throw new Error('no_rpc_result');
    }

    async function fetchUsage() {
        const W = window.WIZ_global_data;
        // no xsrf token means signed out or page not booted yet
        if (!W || !W.SNlM0e) throw new Error('not_ready');

        const base = prefix();
        const qs = new URLSearchParams({
            rpcids: RPC,
            'source-path': `${base}/usage`,
            bl: W.cfb2h || '',
            'f.sid': W.FdrFJe || '',
            hl: W.TuX5cc || document.documentElement.lang || 'en',
            _reqid: String(Math.floor(Math.random() * 900000) + 100000),
            rt: 'c'
        });
        const body = new URLSearchParams({
            'f.req': JSON.stringify([[[RPC, '[]', null, 'generic']]]),
            at: W.SNlM0e
        });

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${base}/_/BardChatUi/data/batchexecute?${qs}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'x-same-domain': '1'
                },
                body,
                signal: ctrl.signal
            });
            if (res.status === 401 || res.status === 403) throw new Error('signed_out');
            if (!res.ok) throw new Error(`http_${res.status}`);
            return parse(await res.text());
        } finally {
            clearTimeout(timer);
        }
    }

    window.addEventListener('message', (ev) => {
        if (ev.source !== window || ev.origin !== location.origin) return;
        const msg = ev.data;
        if (!msg || msg.source !== IN || msg.type !== 'fetch_usage') return;
        fetchUsage().then(
            (payload) => send('usage_result', { id: msg.id, payload }),
            (err) => send('usage_result', { id: msg.id, error: String((err && err.message) || err) })
        );
    });

    send('injector_ready');
})();
