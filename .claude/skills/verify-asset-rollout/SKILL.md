---
name: verify-asset-rollout
description: Model-check and replay release-consistent CSS and JavaScript during rolling deployments. Use before changing templates, embedded static assets, app routing, cache policy, or the rollout strategy.
---

# verify-asset-rollout

## Contract

A visitor's page uses its own release's CSS and JavaScript throughout rollout overlap and instant cutover. `IndexTemplate`, `LegalTemplate` and `NotFoundTemplate` embed CSS with `include_str!`; the home page embeds JavaScript at the end of the body, after its DOM exists. These trusted repository sources are rendered with Askama's `safe` filter. Do not insert visitor-controlled text in these fields. CSS/JS changes require rebuilding the binary. HTML remains `public, max-age=300`, errors remain `no-store`, and compression applies to HTML including its assets.

The Model the Domain principle shaped this fix: the HTML response is the release unit, carrying its own assets rather than coordinating independent pod requests. The cost is larger HTML and no separate browser cache entry for the embedded CSS/JS. `static/main.js` remains an unchanged source path. Public `/static/*` routes remain available with their existing 86400-second cache life. Only the social image still uses `ASSET_VERSION` in page links.

## Model and rules

`AssetRollout.tla` models two releases, one browser, rollout overlap, instant switch, page cache reuse and expiry. Each HTTP action is one atomic response. `InlineAssets` is measured by `asset_facts.rs` through the real `app()` for both home locales. When true, opening HTML from either a pod or cache also applies that HTML's CSS release. No separate CSS request or CSS cache entry is created. The legacy external-link actions remain for mutation detection.

The invariants are unchanged:

- `PageMatchesItsCss` requires the displayed CSS release to equal the page release.
- `NewLinkNeverHoldsOldCss` prohibits caching old CSS under the new release's key.
- `CssLinkNeverFails` prohibits a failed stylesheet request.
- `TypeOK` checks the state domain.

`Bumped` and `ServerChecksVersion` still describe the legacy query-link path. The probe reads current URI behavior and the script compares assets with `BASE` (merge-base with `origin/main` by default). `Overlap` remains TRUE for deploy-as-is and FALSE for cutover. The external k3s facts have not changed and readiness remains out of scope.

The real-build replay adds CSS and JS release markers **before compiling** each release. A local proxy offers the other pod for stylesheet requests. Chromium must display release-2 CSS and execute release-2 JS for new HTML, including a second tab reusing cached HTML after the old pod leaves. Old HTML must retain release-1 CSS and JS across cutover. Any separate CSS request or wrong marker fails the replay. Off-site host resolution is disabled and an off-site response fails the check.

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

```sh
export JAVA=/home/jarvis/Android/jdk-17/bin/java
export TLA2TOOLS=/home/jarvis/t3-tots/out/state-machines/2026-11-08/_tools/tla2tools.jar
export PW_CORE=/path/to/node_modules/playwright-core
export CHROME=/path/to/chrome-headless-shell
.claude/skills/verify-asset-rollout/check.sh
```

The script copies tracked and untracked files, excluding ignored files and `.env*`, into a temporary directory. It probes the actual router, runs TLC on both configurations with one worker and `-Xmx2g`, builds two real releases and runs Chromium. No production requests or checkout writes occur. Check memory and load before running on a shared machine.

Expected output includes both configurations breaking no rules, `A1 FIXED`, `A2 FIXED`, and:

```
RESULT: EXPECTED; known findings none; all rules hold (TLC and replay)
```

Exit 0 means the expected outcomes match. Exit 1 means rules or replay outcomes changed. Exit 2 means missing tooling. Exit 3 means a build, model, replay or isolation failure; inspect the printed temporary work directory. Never treat a failed or incomplete TLC run as a pass.

## Known findings

None. A1 and A2 were reproduced against ac25368 before the fix. Both are retired because matching CSS and JS now arrive in the HTML response. This also covers legal and error pages through the shared page template. Existing independently cached HTML may persist for its old five-minute lifetime during migration; the fixed HTML has no cross-pod CSS/JS fetch.

## Prove the check can turn red

In a disposable checkout, replace the `<style>{{ styles|safe }}</style>` in `templates/index.html` with the old `<link rel="stylesheet" href="/static/styles.css?v={{ asset_version }}" />`, then run `check.sh`.

Expected exit 1 or 3: `InlineAssets` becomes FALSE, TLC reports the original broken invariants, and the positive browser replay rejects release-1 CSS on new HTML. Restore the template afterward. An asset edit without a version bump is now safe for embedded assets, so the former M1 mutation is intentionally replaced. Never weaken an invariant or a replay assertion to make this mutation pass.

## Coverage and sync

- Covered product code: `src/main.rs` template asset fields, `english`, `french`, `legal_english`, `legal_french`, `not_found`, `http_policy`, `app`; `templates/index.html` and `templates/page.html`; embedded `static/styles.css` and `static/main.js`.
- Replay coverage: both home releases, browser HTML caching, CSS application and JS execution, overlap and cutover. Product tests cover all rendered page types and both locales.
- Not covered: social crawler image caching, readiness/502s, intermediary caches, timing or rollout frequency. Infrastructure references remain k3s-ovh-config fb50d13 and the normal rollout workflow, which this change does not edit.
- Sync commit: 3a01624 (re-run green on 2026-11-11; the check was first synchronized at 702be1a). Baseline ac25368 reproduced A1/A2; the fixed-code check returns EXPECTED with no findings. Update this reference after intended behavior changes are replayed and both configurations finish.

## Updating the verification

When asset delivery changes, update the measured fact in `asset_facts.rs` and its HTTP action in `AssetRollout.tla`, preserving every invariant. Update the two-release browser replay to assert the intended behavior positively. Move expected rule sets and known IDs only after comparing real replay output. Keep a mutation that turns the check red. Update coverage and the sync commit after the fixed-code check passes.

The harness rewrites the exact `ASSET_VERSION` declaration and `TcpListener::bind("0.0.0.0:3000")`; update its patterns if those change. Keep marker edits before compilation for embedded assets. No request in any replay may reach the production site.
