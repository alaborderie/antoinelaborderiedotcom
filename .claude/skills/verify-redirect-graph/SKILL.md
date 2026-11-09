---
name: verify-redirect-graph
description: Exhaustively check, up to a bound, every URL a visitor or crawler can reach on antoinelaborderie.com through the real Axum router, following redirects like a browser - loops, hop count, off-site redirects, language, query loss, error caching, HSTS, 404 language, files served from static/. Use before changing routes, redirects, the fallback or not_found, the www redirect or Cache-Control/HSTS policy in http_policy, or the /static ServeDir in src/main.rs.
---

# verify-redirect-graph

**Promise.** Every link to the site (old `/concept` URLs, trailing slashes, `www.`, typos) lands on the right page in its language within two redirects, never leaves the site, and errors are never cached.

**Harm when broken.** Old links and shared links loop, land on the wrong language, drop their campaign parameters, or a 404 is cached by browsers and proxies, which costs visitors and search ranking.

## Why not TLA+ here

The router keeps no state between requests (`app()`, `http_policy` in `src/main.rs:47-140`), so nothing interleaves; the question is whether the code behaves for every input. So the check runs on the code itself: `redirect_graph.rs`, a test appended to a copy of `src/main.rs`, sends 17,588 requests through the real `app()` (http_policy, CompressionLayer, routes, ServeDir, fallback) with `tower::ServiceExt::oneshot` and follows each redirect.

Bound: paths of 1 to 3 segments over `"" fr FR en concept concept-spatial legal-notice mentions-legales static styles.css favicon.svg x .. %2e%2e %2F src main.rs` (third segment from `"" fr styles.css x ..`), with and without `?utm_source=x&v=1`, for Host `antoinelaborderie.com`, `www.antoinelaborderie.com`, `WWW.antoinelaborderie.com:443`; method GET; up to 4 hops. 10,506 start URLs.

## Rules

| Rule | Reader's sentence | Code |
|---|---|---|
| `NoRedirectLoop` | Following redirects never comes back to a URL already visited. | `app()` redirect routes `src/main.rs:53-83`, www branch `108-117` |
| `AtMostTwoRedirects` | Any URL lands within two redirects. | same |
| `RedirectsStayOnSite` | Every Location is a path on the site or `https://antoinelaborderie.com/...`. | same |
| `RedirectHasLocation` | Every 3xx has a Location. | same, plus ServeDir |
| `RedirectsKeepTheLanguage` | A French URL never redirects to an English page. | redirect routes |
| `RedirectsKeepTheQuery` | A redirect keeps the query string. | www branch keeps it (`111`); `Redirect::permanent("...")` routes do not |
| `ErrorsAreNeverCached` | 4xx/5xx are `Cache-Control: no-store`. | `http_policy` `127-128` |
| `EveryResponseHasHsts` | Every response has `Strict-Transport-Security: max-age=31536000`. | `http_policy` `123-126` |
| `NoServerError` | No URL in the bound gives a 5xx. | `render()` `206-214` |
| `OnlyKnownPagesAnswer200` | Outside `/static/`, only `/`, `/fr`, the two legal pages, `/robots.txt`, `/sitemap.xml`, `/favicon.ico` answer 200. | routes, `fallback(not_found)` `91` |
| `StaticServesOnlyFilesUnderStatic` | A 200 under `/static/` has the exact bytes of a file in `static/` (no traversal). | `nest_service("/static", ServeDir...)` `87-90` |
| `NotFoundPageSpeaksTheUrlLanguage` | The 404 page is French exactly when the URL starts with `/fr/`. | `not_found()` `195-204` |

## Does my change touch this?

Yes if the diff touches `app()`, `http_policy`, `not_found`, `render`, any route or `Redirect`, `SITE_URL`, or adds files or folders under `static/`.

## Tools

Only `cargo`: a Rust toolchain (validated with 1.98.1) with the crates of `Cargo.lock` in the cargo cache. Get it with rustup; `cargo fetch` once in the checkout fills the cache. The build runs `--offline` and never downloads. No Java, TLC, Node or browser, so mise plays no part here. A missing `cargo` stops the check with `TOOLING MISSING: <what>` and exit 2.

## Run

From anywhere inside a checkout, no argument:

```sh
.claude/skills/verify-redirect-graph/check.sh
```

It checks the working tree as it is on disk, committed or not. It copies the tracked and untracked files (never ignored files, never `.env*`) to a new `mktemp -d` directory, appends `redirect_graph.rs` to the copy's `src/main.rs`, runs `cargo test` there with `CARGO_TARGET_DIR` inside it, and deletes the build output at exit. Nothing is written into the checkout. No server is started and no request leaves the process: every request goes through `app()` in memory. About 30 s.

## What to expect at the sync commit

```
ENUMERATED 10506 start URLs, 17588 requests
BROKEN NotFoundPageSpeaksTheUrlLanguage 30x, e.g. Host antoinelaborderie.com GET /static/fr/ ... hop 0: /static/fr/ -> 404 Not Found page lang fr
BROKEN RedirectsKeepTheQuery 39x, e.g. Host antoinelaborderie.com GET /concept?utm_source=x&v=1 ... hop 0: /concept?utm_source=x&v=1 -> 308 Permanent Redirect Location /
B1 still reproduces: RedirectsKeepTheQuery broken on 39 start URLs
B2 still reproduces: NotFoundPageSpeaksTheUrlLanguage broken on 30 start URLs
RESULT: EXPECTED; known findings B1 B2 still reproduce and every other rule holds
```

Exit status:

| Exit | Final line starts with | Meaning |
|---|---|---|
| 0 | `RESULT: EXPECTED` | B1 and B2 break their rules on exactly 39 and 30 start URLs; every other rule holds. The state of the code today. |
| 1 | `RESULT: CHANGED (...)` | Another rule breaks, or B1 or B2 breaks on another number of start URLs (fixed, partly fixed, or spread). The parentheses name what changed. |
| 2 | `RESULT: TOOLING MISSING (...)` | `cargo` is missing. Nothing was checked. |
| 3 | `RESULT: CHECK FAILED (...)` | The copy does not build or the enumeration did not run. |

## Read the result

Every `BROKEN` line is the real router's answer, so it is not a model error, but the rule's code can be wrong: read the example and check it with curl against a build of the copy bound to 127.0.0.1 before calling it a bug. (While writing this check, `/static/favicon.svg/` answered 200 with the favicon: a first version of `StaticServesOnlyFilesUnderStatic` compared paths and flagged it; comparing bytes is the rule actually meant.) Never edit a rule to turn a real finding green; add it to `KNOWN` in `check.sh` with its count and report it.

## Known findings at the sync commit

Both replayed with curl on a release build of a copy bound to 127.0.0.1:

1. **B1**, `RedirectsKeepTheQuery` (39 start URLs): `GET /concept?utm_source=newsletter` -> `308 Location: /`; same for `/en`, `/fr/`, `/legal-notice/`, `/fr/mentions-legales/`, `/concept*`. Even `www.antoinelaborderie.com/fr/?utm_source=newsletter` -> `301 https://antoinelaborderie.com/fr/?utm_source=newsletter` -> `308 /fr`: the second hop drops what the first kept. Campaign parameters on old or slash-ended links never reach the page or PostHog.
2. **B2**, `NotFoundPageSpeaksTheUrlLanguage` (30 start URLs): `/static/fr/` and `/static/fr/missing.css` get the French 404. `not_found` runs inside `nest_service("/static", ...)`, where the `Uri` it reads has `/static` stripped, so `/static/fr/...` looks like `/fr/...`. Cosmetic.

All other rules hold within the bound.

When a fix lands on purpose, the check reports `CHANGED` with the new count (0 when fully fixed). Confirm with curl that the old example now behaves, then remove the entry from `KNOWN` and `KNOWN_IDS` in `check.sh` and update this section and the expected output above.

## Prove the check can turn red

Mutation M4 from the analysis: mark only 5xx responses `no-store`.

```sh
sed -i 's/if response.status().is_client_error() || response.status().is_server_error() {/if response.status().is_server_error() {/' src/main.rs
.claude/skills/verify-redirect-graph/check.sh; echo "exit=$?"
git checkout -- src/main.rs
```

Expected: a new line `BROKEN ErrorsAreNeverCached ...`, then `CHANGED: ErrorsAreNeverCached newly broken`, `RESULT: CHANGED (ErrorsAreNeverCached); ...`, exit 1. The `git checkout` undoes it.

## Coverage and sync

- Covered: `src/main.rs` `app()`, `http_policy`, `not_found`, `render`, `robots`, `sitemap`, `favicon`, and the redirect closures; tower-http 0.6.2 ServeDir and CompressionLayer as wired there (identity encoding only).
- Not covered: methods other than GET, `Accept-Encoding` variants, paths outside the bound (longer, other segments, non-ASCII), Traefik's own handling of Host and paths before the app.
- Sync commit: **7b125e4**, the `origin/main` this skill was added from. On 2026-11-09 the anchors above were read at that commit and `check.sh`, run from this repository's checkout, gave `RESULT: EXPECTED` (exit 0); M4 gave `RESULT: CHANGED` (exit 1). Move it forward only after `check.sh` gives `EXPECTED` at the new commit, or after the known findings were updated with curl evidence.
