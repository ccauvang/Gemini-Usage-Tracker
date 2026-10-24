# Privacy Policy: Gemini Usage Tracker

Last updated: October 24, 2026

Gemini Usage Tracker shows your Gemini usage limits (session and weekly) on gemini.google.com.

## Data we collect

None. The extension does not collect, store on any server, sell, share or transmit your data.

## What it does on your device

- Asks Gemini for your usage numbers (percent and reset time) with the same request Gemini's own usage page makes. The request goes to gemini.google.com, uses your already signed-in session, and runs inside your browser.
- If that request fails, it falls back to loading your usage page in a hidden frame and reading the numbers from it, only inside your browser.
- Reads your plan name from the badge next to your profile picture on the Gemini page. If there is no badge, it shows "Free".
- Saves your "show chat bar ring" setting locally (`chrome.storage.local`) and caches the last usage numbers in memory for the open tab (`chrome.storage.session`). All data stays on your device.
- Your Gemini session token is used only to make that one request to gemini.google.com. It is never stored, logged or sent anywhere else.

## Third parties

No analytics, no ads, no tracking, no remote servers. The extension talks only to gemini.google.com. Nothing else is loaded.

## Permissions

- declarativeNetRequest: used only by the fallback, lets the hidden usage page load inside Gemini.
- storage: Saves the user's "show ring" setting (chrome.storage.local) and the last read usage numbers for the open tab (chrome.storage.session, memory only, cleared when the browser closes). Nothing is sent outside the browser.
- gemini.google.com access: show the panel and read your usage numbers.

## Contact

email: ext.support@ccauvang.com

## Changes

If this policy changes, the update will be posted here.
