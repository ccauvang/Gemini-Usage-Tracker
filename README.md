# Gemini Usage Tracker

Chrome and Firefox extension that shows your Gemini usage limits right on the Gemini page.

> [!NOTE]
> Not affiliated with Google. Gemini is a trademark of Google.

## Build

Chrome needs `background.service_worker` and Firefox needs `background.scripts`, so there are two manifests: `manifest.json` for Chrome and `manifest.firefox.json` for Firefox. The build script packs each one into its own zip.

```ps1

cd build
npm install
npm run build
```

Zips land in `build/dist/`.

## Install (unpacked)

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

Gemini has a usage page at `/usage`. The extension opens that page in a hidden frame on the same origin, reads the percent and reset time, then closes the frame. Nothing is sent anywhere else.

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
| `declarativeNetRequest` | Removes the `x-frame-options` header on Gemini's own `/usage` page, only for frames started by `gemini.google.com`, so the hidden frame can load. |
| `storage` | Keeps the latest usage per tab (session storage) and the ring on/off setting. |
| `https://gemini.google.com/*` | The only site the extension runs on. |

- No accounts, no analytics, no remote servers.
- Reads only your own usage page and keeps the result in your browser.
- Loads the Google Sans font stylesheet from fonts.googleapis.com. No other network requests.
- No data leaves your machine.

## Limitations

- Depends on Gemini's usage page markup. If Google changes it, scraping stops and the console prints a `[gut] scrape timeout: ...` line saying which part is missing.
- Reset times are parsed from English text such as `Resets at 6:19 PM`. Other languages still show percents but not time left.
- Works with Gemini's light and dark themes.
- Chrome 102 or newer, Firefox 128 or newer.

## License

MIT, see [LICENSE](LICENSE).
