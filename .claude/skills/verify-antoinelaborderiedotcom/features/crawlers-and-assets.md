# Crawlers and assets

Search engines read `robots.txt` and a sitemap of the four indexable pages. Browsers and link previews fetch the favicon and the files under `/static/`. Every answer carries an HSTS header and a cache lifetime that fits its content, and text answers are compressed when the client asks.

## Sub-features

- `robots` allows every crawler and names the sitemap.
- `sitemap` lists the four pages with a last-modified date and language alternates, and each listed URL is a real page that names itself as canonical.
- `favicon` serves an SVG icon at `/favicon.ico`.
- `static-files` serves every file of `static/` with a one-day cache lifetime.
- `compression` answers with Brotli or gzip when asked.
- `transport-and-cache-policy` sends HSTS on every answer, five minutes of cache for pages and redirects, one day for static files and none for errors.

## How to get to it (user POV)

- A crawler requests `/robots.txt`, then `/sitemap.xml`.
- A browser requests `/favicon.ico` for the tab icon.
- A link preview requests `/static/og-image.png?v=<ASSET_VERSION>`, the URL the home pages name as their social image.
- Any client requests a file under `/static/`, such as `/static/antoine-laborderie.webp`.
- A browser sends `Accept-Encoding: br` or `gzip` with any request.

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.
- On `local` and `image`, the working tree's `static/` is the one the instance was built from.

- **Read robots.txt.** Run `$V drive crawlers-and-assets`, check `robots`. The answer is 200 as `text/plain; charset=utf-8` and its body is exactly `User-agent: *`, `Allow: /` and `Sitemap: https://antoinelaborderie.com/sitemap.xml`.
- **Read the sitemap.** Check `sitemap`. The answer is 200 as `application/xml; charset=utf-8` with four `url` entries. Each has a `loc` on `https://antoinelaborderie.com`, a `lastmod` date and three `hreflang` alternates. The driver then requests each listed path on the target. Each answers 200 and its HTML names the listed URL as canonical.
- **Fetch the favicon.** Check `favicon`. `/favicon.ico` answers 200 as `image/svg+xml` and the body starts with `<svg`.
- **Fetch every static file.** Check `static-files`. Each file in `static/` answers 200 at `/static/<name>` with `Cache-Control: public, max-age=86400`. On `local` and `image` the bytes equal the file in the checkout.
- **Ask for compression.** Request `/` and `/static/styles.css` with `Accept-Encoding: br`, then `gzip`. Check `compression`. `Content-Encoding` is the encoding asked for and `Vary` names `accept-encoding`.
- **Read the headers.** Check `transport-and-cache-policy`. `/`, `/fr`, both legal pages, `/robots.txt` and the redirect `/en` answer with `Cache-Control: public, max-age=300`, `/static/styles.css` with `public, max-age=86400` and `/missing` with `no-store`. All carry `Strict-Transport-Security: max-age=31536000`.
- **Proof.** The `crawlers-and-assets/` blocks of `run.log` list every request and status.

## Gotchas

- The pages embed their CSS and JavaScript. `/static/styles.css` and `/static/main.js` stay public, but no page links to them. The `verify-asset-rollout` skill covers why.
- On `prod`, `static-files` checks status and cache only. `build-and-deploy/live-release` compares the bytes with `origin/main`.
- A file added to `static/` is public as soon as the image is deployed. `static-files` picks it up from the directory listing.
- The sitemap's `lastmod` is the `LAST_MODIFIED` constant, a content revision date. It does not change with each deploy.
- The driver sends no `Accept-Encoding` except in `compression`, so bodies are plain everywhere else.
- The cache lifetime follows the request path and the status, not the content. `/favicon.ico` serves a file of `static/` with the five-minute lifetime, and a www redirect of a `/static/` path gets one day.
- Images other than SVG are never compressed. `compression` asks for a page and the stylesheet only.
