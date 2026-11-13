# Analytics

The two home pages measure their traffic with PostHog Cloud EU, without cookies and without writing anything to the browser's storage. No other page loads analytics. The legal notice promises exactly this to visitors, so a drift here is a legal problem and not only a technical one.

## Sub-features

- `analytics-on-home` loads the PostHog SDK on `/` and `/fr` with the cookieless options and posts one `$pageview` event to the EU endpoint.
- `analytics-writes-no-storage` leaves cookies, `localStorage` and `sessionStorage` empty after the page view and a scroll.
- `analytics-absent-elsewhere` contacts no PostHog host from the legal pages and the 404 pages.

## How to get to it (user POV)

- Open `/` or `/fr` in a browser with JavaScript on. Nothing is visible. The page view leaves in the background.
- Open a legal page or a missing page. Nothing is sent.

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.
- The machine can reach `https://eu-assets.i.posthog.com`.
- The browser is the full Chromium build that `$V drive` starts. See the first gotcha.

- **Load a home page.** Open `/`, then `/fr`. Run `$V drive analytics`, check `analytics-on-home`. `window.posthog.__loaded` becomes true, and `window.posthog.config` has `api_host` `https://eu.i.posthog.com`, `defaults` `2026-08-30`, `cookieless_mode` `always`, `person_profiles` `never`, `autocapture`, `capture_heatmaps`, `capture_dead_clicks`, `capture_performance` and `capture_exceptions` all false, and `disable_session_recording` and `disable_surveys` true. The page then posts to `eu.i.posthog.com/e/`. The driver answers that request itself, reads the body and finds exactly one event, `$pageview`.
- **Look at the storage.** Open `/`, wait for the page view, scroll to the bottom and wait one second. Check `analytics-writes-no-storage`. `document.cookie` is empty, `localStorage` and `sessionStorage` have no key, and the browser context holds no cookie.
- **Open the other pages.** Open `/legal-notice`, `/fr/mentions-legales`, `/missing` and `/fr/missing` and wait for the network to go idle. Check `analytics-absent-elsewhere`. No request goes to a `posthog.com` host and `window.posthog` is undefined.
- **Proof.** The `analytics/` blocks of `run.log` list the PostHog URLs each home page requested and the names of the events it posted.

## Gotchas

- PostHog sends no page view from a browser it takes for a bot. It reads `navigator.webdriver` and the `HeadlessChrome` brand. `$V drive` starts full Chromium with `--disable-blink-features=AutomationControlled` and removes `Headless` from the user agent. With the headless shell the SDK loads and `analytics-on-home` times out on the `$pageview` event.
- The driver answers every request to `eu.i.posthog.com` itself with a 200, on every target, so a drive never adds a page view to the project. The map therefore proves that the page sends the event, not that PostHog stores it. Use the PostHog project to check ingestion.
- The legal notice also promises that leaving the page sends the time spent and the scroll depth. This map does not prove that. On 2026-11-13 the driver saw no request and no `sendBeacon` call when a visitor followed a link from the home page in Chromium 156. Report a claim about the page-leave event as unverified.
- The SDK and its remote config come from `eu-assets.i.posthog.com` and are allowed through. Without network access the first check fails with a timeout on the SDK.
- Options set in the PostHog project (discarded IP data, retention) are not visible from the page.
- A change to any option in `templates/index.html` needs the same change in the expected config of `analytics-on-home` and in both legal texts.
