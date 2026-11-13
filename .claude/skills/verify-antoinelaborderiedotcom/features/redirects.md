# Redirects

Old and mistyped links still land on the right page in the right language. `/en`, the retired `/concept` and `/concept-spatial` pages and every trailing-slash form redirect permanently to a current page, keep the query string, and the `www` host redirects to the bare domain.

## Sub-features

- `old-links` redirects each of the 13 old or trailing-slash paths with a 308 to its current page.
- `query-kept` keeps the query string on each of those redirects.
- `www-to-apex` redirects `www.antoinelaborderie.com` to `https://antoinelaborderie.com` with a 301, keeping path and query.
- `browser-lands` follows an old French link in a browser to the French home page.

## How to get to it (user POV)

- Follow an old link or bookmark: `/en`, `/concept`, `/concept/fr`, `/concept-spatial`, `/concept-spatial/fr`.
- Type or follow a URL with a trailing slash: `/en/`, `/fr/`, `/legal-notice/`, `/fr/mentions-legales/`, `/concept/`, `/concept/fr/`, `/concept-spatial/`, `/concept-spatial/fr/`.
- Open any path on `www.antoinelaborderie.com`.
- Arrive from a campaign link that adds a query string to any of these.

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.

- **Request each old path.** Run `$V drive redirects`, check `old-links`. Each answers 308 with `Location` `/` for an English path and `/fr` for a French one. `/legal-notice/` goes to `/legal-notice` and `/fr/mentions-legales/` to `/fr/mentions-legales`.
- **Add a query string.** Request each old path with `?utm_source=newsletter&tag=a%2Fb`. Check `query-kept`. Each `Location` ends with the same query string, with `%2F` still encoded.
- **Use the www host.** Request `/fr?source=www&lang=fr` on the www host. Check `www-to-apex`. The answer is 301 with `Location: https://antoinelaborderie.com/fr?source=www&lang=fr`. On `local` and `image` the driver sends the request to the instance with `Host: www.antoinelaborderie.com`. On `prod` it requests `https://www.antoinelaborderie.com`.
- **Follow one in a browser.** Open `/concept-spatial/fr/?utm_source=old-card`. Check `browser-lands`. The browser ends on `/fr?utm_source=old-card` with status 200 and `lang="fr"`.
- **Proof.** The `redirects/` blocks of `run.log` list every HTTP request with its status and `Location`. The `browser-lands` block shows the final status, path and query.

## Gotchas

- Path redirects are 308 and the www redirect is 301. Do not assert one code for both.
- On production, `http://` to `https://` is done by the ingress in front of the app. This map does not cover it.
- A redirect from the www host on a local instance still points at `https://antoinelaborderie.com`. Do not follow it from a local drive, or you leave the instance.
- The `verify-redirect-graph` skill checks every reachable URL up to a bound for loops, hop count and language. This map proves the links a visitor is known to use.
