---
name: verify-redirect-graph
description: Exhaustively check, up to a bound, every URL a visitor or crawler can reach on antoinelaborderie.com through the real Axum router, following redirects like a browser - loops, hop count, off-site redirects, language, query loss, error caching, HSTS, 404 language, files served from static/. Use before changing routes, redirects, the fallback or not_found, the www redirect or Cache-Control/HSTS policy in http_policy, or the /static ServeDir in src/main.rs.
---

# verify-redirect-graph

**Promise.** Every link to the site (old `/concept` URLs, trailing slashes, `www.`, typos) lands on the right page in its language within two redirects, never leaves the site, and errors are never cached.

**Harm when broken.** Old links and shared links loop, land on the wrong language, drop their campaign parameters, or a 404 is cached by browsers and proxies, which costs visitors and search ranking.

## Why not TLA+ here

The router keeps no state between requests (`app()`, `http_policy` in `src/main.rs:49-154`), so nothing interleaves; the question is whether the code behaves for every input. So the check runs on the code itself: `redirect_graph.rs`, a test appended to a copy of `src/main.rs`, sends 17,588 requests through the real `app()` (http_policy, CompressionLayer, routes, ServeDir, fallback) with `tower::ServiceExt::oneshot` and follows each redirect.

Bound: paths of 1 to 3 segments over `"" fr FR en concept concept-spatial legal-notice mentions-legales static styles.css favicon.svg x .. %2e%2e %2F src main.rs` (third segment from `"" fr styles.css x ..`), with and without `?utm_source=x&v=1`, for Host `antoinelaborderie.com`, `www.antoinelaborderie.com`, `WWW.antoinelaborderie.com:443`; method GET; up to 4 hops. 10,506 start URLs.

## Rules

| Rule | Reader's sentence | Code |
|---|---|---|
| `NoRedirectLoop` | Following redirects never comes back to a URL already visited. | `app()` redirect routes `src/main.rs:55-85`, www branch `111-123` |
| `AtMostTwoRedirects` | Any URL lands within two redirects. | same |
| `RedirectsStayOnSite` | Every Location is a path on the site or `https://antoinelaborderie.com/...`. | same |
| `RedirectHasLocation` | Every 3xx has a Location. | same, plus ServeDir |
| `RedirectsKeepTheLanguage` | A French URL never redirects to an English page. | redirect routes |
| `RedirectsKeepTheQuery` | A redirect keeps the query string. | `http_policy` preserves the original query on redirects, including legacy routes and ServeDir |
| `ErrorsAreNeverCached` | 4xx/5xx are `Cache-Control: no-store`. | `http_policy` `142-143` |
| `EveryResponseHasHsts` | Every response has `Strict-Transport-Security: max-age=31536000`. | `http_policy` `138-141` |
| `NoServerError` | No URL in the bound gives a 5xx. | `render()` `225-232` |
| `OnlyKnownPagesAnswer200` | Outside `/static/`, only `/`, `/fr`, the two legal pages, `/robots.txt`, `/sitemap.xml`, `/favicon.ico` answer 200. | routes, `fallback(not_found)` `93` |
| `StaticServesOnlyFilesUnderStatic` | A 200 under `/static/` has the exact bytes of a file in `static/` (no traversal). | `nest_service("/static", ServeDir...)` `89-92` |
| `NotFoundPageSpeaksTheUrlLanguage` | The 404 page is French when the original URL starts with `/fr/` or `/static/fr/`. | `not_found()` `214-222` |

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

## Expected outcome

```
ENUMERATED 10506 start URLs, 17588 requests
RESULT: EXPECTED; known findings none; all rules hold
```

Exit 0 means every rule holds within the unchanged URL and hop bounds. Exit 1 means a rule broke, exit 2 means missing cargo, and exit 3 means compilation or enumeration failed. Inspect the temporary directory printed by the script.

## Known findings

None. Baseline ac25368 reproduced B1 on 39 URLs and the previous B2 rule on 30 URLs. B1 is fixed by carrying the original query through every redirect. The product suite tests all 13 legacy routes, including escaped and repeated parameters.

B2 was a contract conflict rather than an observed English response. The analysis and baseline replay both showed French under `/static/fr/`, while their rule expected English. On 2026-11-10 the task owner explicitly chose French, as the task acceptance requires. The rule now includes this namespace. `not_found` reads `OriginalUri` and names both French prefixes explicitly, so behavior no longer depends on Axum stripping the mount prefix. Product regressions cover `/static/fr/` and `/static/fr/missing.css` and assert French HTML, 404 and no-store. This is an approved correction of the language contract, not a weakened query, cache, traversal, hop or site rule.

For an unexpected result, inspect the example and replay against a local build before declaring a product bug. Never make a rule weaker just to hide an unexpected result. Record newly reproduced findings in `KNOWN` and `KNOWN_IDS`, then update this document.

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
- Sync commit: 3a01624 (re-run green on 2026-11-11; the check was first synchronized at 702be1a). Baseline ac25368 reproduced B1 and the disputed B2 contract. The fixed-code check returns EXPECTED with no findings. M4 still detects error caching. After an intended change, replay the old example locally, update expectations only with evidence, then refresh the sync and coverage record.
