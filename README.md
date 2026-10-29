# Gemini Usage Tracker

Chrome and Firefox extension that shows your Gemini usage limits right on the Gemini page.

> [!NOTE]
> Not affiliated with Google. Gemini is a trademark of Google.

## Chrome

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/dpipnpibjnepbonelhnnbcoiihildhnj?logo=chromewebstore)](https://chromewebstore.google.com/detail/gemini-usage-tracker/dpipnpibjnepbonelhnnbcoiihildhnj)

## Build

Chrome needs `background.service_worker` and Firefox needs `background.scripts`, so there are two manifests: `manifest.json` for Chrome and `manifest.firefox.json` for Firefox. The build script packs each one into its own zip, named with that manifest's own version.

```ps1

cd build
npm install
npm run build
```

Zips land in `build/dist/`.

## Install (unpacked)

### Chromium base browser

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.
4. Open `https://gemini.google.com/app`.

### Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `manifest.firefox.json`.
3. Open `https://gemini.google.com/app`.

Temporary add-ons are removed when Firefox closes.

## How it works

Gemini's own usage page (`/usage`) gets its numbers from a request to Gemini. The extension makes that same request from inside the Gemini page, using your already signed-in session, and reads the percent and reset time from the answer. A small script in the page context (`src/injector.js`) does the request, because the tokens it needs only exist there.

If that request fails or the answer cannot be read, the extension falls back to the old way: it opens `/usage` in a hidden frame on the same origin, reads the percent and reset time from the page, then closes the frame.

The plan name (Pro, Plus, Ultra, ...) is read from the badge next to your profile picture. No badge means "Free".

Nothing is sent anywhere else.

It refreshes when:

- you open the main chat page
- a reply finishes (about 2.5 seconds after)
- the tab becomes visible again
- a reset time passes
- you press refresh in the popup

There is no timer polling, and automatic refreshes are at least 15 seconds apart.

## Permissions

| Permission | Why |
| --- | --- |
| `declarativeNetRequest` | Fallback only. Removes the `x-frame-options` header on Gemini's own `/usage` page, only for frames started by `gemini.google.com`, so the hidden frame can load. |
| `storage` | Keeps the latest usage per tab (session storage) and the ring on/off setting. |
| `https://gemini.google.com/*` | The only site the extension runs on. |

- No accounts, no analytics, no remote servers.
- Reads only your own usage numbers and keeps the result in your browser.
- Your session token is used only for the one request to gemini.google.com. It is never stored or sent anywhere else.
- Talks only to gemini.google.com nothing else is loaded.
- No data leaves your machine.

## Limitations

- The usage request is an internal Gemini call, not a public API. If Google changes it, the extension logs `[gut] rpc failed: ...` in the console and switches to the hidden frame fallback.
- The fallback depends on Gemini's usage page markup. If Google changes it too, scraping stops and the console prints a `[gut] scrape timeout: ...` line saying which part is missing.
- Reset times from the main request are exact timestamps, so they work in any language. The fallback reads reset text in English and Vietnamese only. Other languages still show percents there but not time left.
- Works with Gemini's light and dark themes.
- Chrome 111 or newer, Firefox 140 or newer.

## License

MIT, see [LICENSE](LICENSE).
