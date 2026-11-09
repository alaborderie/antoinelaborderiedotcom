---
name: verify-asset-rollout
description: Model-check (TLA+/TLC) what one visitor's browser sees while a release of antoinelaborderie.com rolls out, fed by facts read from the real router and replayed on two real builds in Chromium. Use before shipping a change to static/styles.css, static/main.js, static/og-image.png, ASSET_VERSION, the ?v= links in templates/index.html, the /static route or the Cache-Control policy in http_policy (src/main.rs), or the landing-website Deployment, and whenever a release left visitors with a broken-looking page.
---

# verify-asset-rollout

**Promise.** A visitor's page is always styled by the CSS (and run by the JS) of its own release, before, during and after a deploy.

**Harm when broken.** A visitor sees the new page with the old stylesheet (or the reverse), and the browser keeps that wrong stylesheet under the new `?v=` link for up to 24 hours, on every new page view.

## What is checked

`AssetRollout.tla` models one browser and one release (release 1 live, release 2 ships a different `static/styles.css`). Every step is one HTTP exchange answered atomically by one stateless handler, one cache expiry, or one change in which pods Traefik sends traffic to. Rules (INVARIANTS):

| Rule | Reader's sentence | Code it depends on |
|---|---|---|
| `PageMatchesItsCss` | The page you see is styled by the CSS of its own release. | `templates/index.html:21,54` (`?v={{ asset_version }}`), `ASSET_VERSION` `src/main.rs:16` |
| `NewLinkNeverHoldsOldCss` | The browser never keeps another release's CSS under the URL the new release links to. | `nest_service("/static", ServeDir::new("static"))` `src/main.rs:87-90` ignores `?v=`; `http_policy` `src/main.rs:127-138` sends `public, max-age=86400` on static 2xx, `public, max-age=300` on pages |
| `CssLinkNeverFails` | A page's stylesheet link never fails. | same; guards a naive "reject other ?v=" fix |

Model constants and where they come from:

- `Bumped`: TRUE when the checkout bumps `ASSET_VERSION` whenever it changes a versioned asset, and the home pages link `styles.css` and `main.js` with `?v=ASSET_VERSION`. `check.sh` derives it from git (working tree against `BASE`, the release now live) and from the real router.
- `ServerChecksVersion`: TRUE when `GET /static/styles.css?v=<another value>` is not a 200. `check.sh` reads it from the real router (`asset_facts.rs`).
- `Overlap`: whether old and new pod both receive traffic during the rollout. Not in this repo: `k3s-ovh-config/landing-website.yaml` (read at fb50d13) has `replicas: 1`, the default RollingUpdate (maxSurge 1, maxUnavailable 0), no readinessProbe, and CI runs `kubectl rollout restart deployment landing-website` (`.github/workflows/rust.yml`, job `rollout`, line 55). So `deploy-as-is.cfg` uses `Overlap = TRUE`. `cutover.cfg` uses `Overlap = FALSE` (an instant switch, the best a deploy can do) to keep code regressions visible apart from the infrastructure finding.

`replay.mjs` then plays both known paths on real builds of the checkout: release 1 is the checkout as it is, release 2 is the same code with `ASSET_VERSION` bumped. Each build serves its own `static/`, whose `styles.css` carries a `--release` marker, on 127.0.0.1. A small proxy stands in for Traefik and sends each request to the pod the path names. Chromium's own HTTP cache plays the browser cache.

## Does my change touch this?

Yes if the diff touches any of: `static/styles.css`, `static/main.js`, `static/og-image.png`, `ASSET_VERSION` or `http_policy` or the `/static` `nest_service` in `src/main.rs`, the `?v=` links in `templates/index.html`, the `Dockerfile` `COPY static/` line, the `rollout` job in `.github/workflows/rust.yml`, or the landing-website Deployment in k3s-ovh-config.

## Tools

`check.sh` resolves its tools in this order and never downloads anything:

1. When the repository root has a `mise.toml` or `.mise.toml` and `mise` is installed, it loads that environment (`mise env`), so a pinned `java` and a `TLA2TOOLS` set under `[env]` apply. This repository has no mise file today, so this step does nothing here.
2. Otherwise it uses the environment: `JAVA` (or `java` on `PATH`) and `TLA2TOOLS`.

| Variable or tool | What | How to get it |
|---|---|---|
| `TLA2TOOLS` | `tla2tools.jar` v1.7.4 (TLC 2.19, rev 5a47802), sha256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` | `curl -fLo tla2tools.jar https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar`, then `sha256sum tla2tools.jar`. On the machine jarvis a copy with this sha256 is at `/home/jarvis/t3-tots/out/state-machines/2026-11-08/_tools/tla2tools.jar`. |
| `JAVA` | Java >= 11 (validated with Temurin 17.0.13) | any JDK; or put `java` on `PATH` |
| `cargo` | Rust toolchain (validated with 1.98.1), the crates of `Cargo.lock` in the cargo cache | rustup; `cargo fetch` once in the checkout fills the cache. Builds run `--offline`. |
| `node` | Node >= 18 (validated with 26.13.0) | nvm or the distribution |
| `PW_CORE` | a `playwright-core` package directory (validated with 1.64.1) | `PW=$(mktemp -d) && npm install --prefix "$PW" playwright-core@1.64.1`, then `PW_CORE=$PW/node_modules/playwright-core` |
| `CHROME` | Chrome Headless Shell 156.0.8078.4 (Playwright's `chromium-headless-shell` v1248) | `"$PW/node_modules/.bin/playwright-core" install chromium-headless-shell`; on Linux x64 the binary is `$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell` |

A missing tool stops the check before anything runs, with `TOOLING MISSING: <what>` and exit 2.

## Run

From anywhere inside a checkout, no argument:

```sh
export TLA2TOOLS=/path/to/tla2tools.jar JAVA=/path/to/bin/java
export PW_CORE=/path/to/node_modules/playwright-core CHROME=/path/to/chrome-headless-shell
.claude/skills/verify-asset-rollout/check.sh
```

It checks the working tree as it is on disk, committed or not. It copies the tracked and untracked files (never ignored files, never `.env*`) to a new `mktemp -d` directory, builds there with `CARGO_TARGET_DIR` inside it, and deletes the build output at exit. Nothing is written into the checkout. `BASE` (default: the merge-base of `HEAD` and `origin/main`) is the release now live, used only to decide `Bumped`.

Steps, about 30 s on a warm cargo cache: `cargo test` of `asset_facts.rs` appended to the copy's `src/main.rs`, two TLC runs (`-workers 1`, `-Xmx2g -XX:+UseParallelGC`, under `timeout 300`, 179 and 48 distinct states), two debug builds, the Chromium replay.

Isolation: the pods bind 127.0.0.1 on free ports between 20000 and 32000 (the only source edits, in the copy). Chromium runs with `--host-resolver-rules` that leave only 127.0.0.1 resolvable, so the page's PostHog script never loads and no event leaves the machine. The replay prints the off-site hosts the page tried and which answered; an answer stops the check with exit 3. No secret and no `.env` is read.

## What to expect at the sync commit

```
SAME    deploy-as-is.cfg: breaks [ NewLinkNeverHoldsOldCss PageMatchesItsCss ] = known finding A1 (179 distinct states found)
SAME    cutover.cfg: breaks [ PageMatchesItsCss ] = known finding A2 (48 distinct states found)
A1 REPRODUCED on the real builds
A2 REPRODUCED on the real builds
off-site hosts the page tried: eu-assets.i.posthog.com; answered: none
RESULT: EXPECTED; known findings A1 A2 still reproduce (TLC and replay) and every other rule holds
```

Exit status:

| Exit | Final line starts with | Meaning |
|---|---|---|
| 0 | `RESULT: EXPECTED` | A1 and A2 still break the same rules in TLC and still reproduce on the real builds; every other rule holds. The state of the code today. |
| 1 | `RESULT: CHANGED (...)` | A config breaks other rules than its known finding, or a replay no longer reproduces A1 or A2. The parentheses name what changed. |
| 2 | `RESULT: TOOLING MISSING (...)` | A tool above is missing. Nothing was checked. |
| 3 | `RESULT: CHECK FAILED (...)` | The check could not run: the copy does not build, TLC did not finish, a pod did not start, or the isolation leaked. |

## Read the result

Read every TLC result with the `/statechart` skill on `AssetRollout.tla`, the generated `<work dir>/<config>.cfg`, and `view.mjs` from this folder. It gives each broken rule's shortest path in plain words, and a chart when the model is under 500 states.

- **CHANGED with a new broken rule**: the change makes a visitor's page worse. Get the path with `/statechart`, then replay it on the real code before calling it a bug: add it to `replay.mjs`, one step per TLA+ action.
- **CHANGED with a known finding gone** (a config breaks fewer rules, or `A1/A2 NOT REPRODUCED`): the change fixed it, or moved the code away from the model. Confirm in the replay output that the old path no longer happens.
- **Bug or model error?** If the real page does not end up in the state a TLC path names, treat the model as wrong until you show otherwise, and fix the model, not the rule.

## Known findings at the sync commit

1. **A1**, `deploy-as-is.cfg` breaks `NewLinkNeverHoldsOldCss` and `PageMatchesItsCss`. Path: (0) old release live; (1) the new pod starts taking traffic; (2) you open the home page and the new pod answers (page links `styles.css?v=<new>`); (3) the CSS request reaches the old pod, which serves its own `styles.css` with 200 `public, max-age=86400`. The new page shows old CSS and the browser keeps it under the new link: after the old pod is gone, every new page view reuses it for up to a day. Replayed on the real builds, including the reuse after the old pod left. The production overlap window is inferred from the manifest, not observed.
2. **A2**, `cutover.cfg` breaks `PageMatchesItsCss`: (1) you open the page on the old release; (2) traffic switches; (3) the CSS request reaches the new release. The old page shows new CSS until the cached page expires (5 min). Replayed on the real builds.
3. `CssLinkNeverFails` holds. A fix that 404s other `?v=` values trades A1 and A2 for this rule (seen by mutation in the analysis). A fix that keeps both releases' assets reachable (content-hashed file names kept across releases, or the previous release's files shipped in the image) is what removes both.

When a fix lands on purpose and the replay shows the old path no longer happens, retire the finding in `check.sh`: empty that config's expected rules in the `for cfg in` list, drop its id from `KNOWN_IDS` and from the `for id in A1 A2` replay loop, and update this section and the expected output above.

## Prove the check can turn red

Mutation M1 from the analysis: change a versioned asset without bumping `ASSET_VERSION`.

```sh
printf '\n/* mutation: changed without an ASSET_VERSION bump */\n' >> static/styles.css
.claude/skills/verify-asset-rollout/check.sh; echo "exit=$?"
git checkout -- static/styles.css
```

Expected: `NOTE assets changed since BASE but ASSET_VERSION did not`, `CHANGED cutover.cfg: breaks [ NewLinkNeverHoldsOldCss PageMatchesItsCss ], known finding A2 breaks [ PageMatchesItsCss ] (38 distinct states found)`, `RESULT: CHANGED (cutover.cfg); ...`, exit 1. The `git checkout` undoes it. On a branch that already changes `static/`, set `BASE` to the commit the branch started from.

## Coverage and sync

- Covered: `src/main.rs` `ASSET_VERSION`, `app()` (the `/static` `nest_service`), `http_policy` (Cache-Control branch), `english()`, `french()`; `templates/index.html` stylesheet and script links; `static/styles.css`, `static/main.js`, `static/og-image.png` as versioned assets; `.github/workflows/rust.yml` job `rollout`; outside the repo, `k3s-ovh-config/landing-website.yaml` (fb50d13).
- Not covered: shared caches between visitor and Traefik (none known), the 502s a pod without readinessProbe can cause before it listens, `og-image.png` as seen by social crawlers, timing (the model says what can happen, not how often; the overlap window is a few seconds per deploy). `main.js?v=` follows the same mechanism and is not modeled apart.
- Sync commit: **7b125e4** (`revert: undo the Etcheverry rename and light redesign (#12, #13) (#14)`), the `origin/main` this skill was added from. On 2026-11-09 the anchors above were read at that commit and `check.sh`, run from this repository's checkout, gave `RESULT: EXPECTED` (exit 0); M1 gave `RESULT: CHANGED` (exit 1). Move the sync commit forward only after you confirm, at the new commit, that each anchor still says what this file claims and that `check.sh` gives `EXPECTED`, or after you updated the findings with replayed evidence.

## Updating the verification

- A code change that alters a fact (`?v=` handling, Cache-Control values, which files are versioned): update the matching action in `AssetRollout.tla` (one action per HTTP exchange) and its comment anchors, then rerun. Never drop or weaken a rule to get `EXPECTED`.
- The bind line `TcpListener::bind("0.0.0.0:3000")` or the `const ASSET_VERSION: &str = "...";` line changes shape: `check.sh` stops with exit 3 and says so; update its `sed` patterns.
- The k3s strategy changes (e.g. `Recreate`, or a readinessProbe plus a preStop delay): `Overlap` stays a statement about whether two releases can answer one visitor within one page load; set it from the manifest and say so in this file.
