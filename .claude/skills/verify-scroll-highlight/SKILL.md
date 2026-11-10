---
name: verify-scroll-highlight
description: Model-check (TLA+/TLC) the "you are here" highlight that static/main.js keeps while a visitor scrolls the antoinelaborderie.com home page (aria-current on the Selected work stage links, body[data-active-scene] and --scene), with a Chromium probe that ties the model to the real page. Use before changing the IntersectionObserver code or options in static/main.js, the data-scene / data-stage / data-stage-link markup in templates/content/{en,fr}.html, or CSS that changes the height of those sections.
---

# verify-scroll-highlight

**Promise.** While you scroll the home page, the highlighted section (stage link with `aria-current="location"`, accent color, `body[data-active-scene]`) is a section you are actually reading, and it only moves forward when you scroll down and backward when you scroll up.

**Harm when broken.** The navigation tells screen-reader and sighted visitors they are in a section they have left, or jumps back to the previous project while they scroll forward.

## What is checked

`ScrollTracking.tla` models one IntersectionObserver callback of `static/main.js`:

- `stageObserver` (`static/main.js:62-100`): targets `[data-stage]`, `rootMargin: "-18% 0px -45%"`, `threshold: [0, 0.2, 0.5]`; sets `aria-current`/`is-active` on `[data-stage-link]`, `--scene`, the stage meter.
- `sectionObserver` (`static/main.js:38-60`): targets `[data-scene]`, `rootMargin: "-30% 0px -45%"`, `threshold: [0, 0.25, 0.5]`; sets `body.dataset.activeScene` and `--scene`.

Both maintain a `Set` of targets currently intersecting the band. Each callback applies every delivered entry to that set, retains its active target while it is still in the set, and otherwise chooses the first member in document order. If the set is empty, the DOM highlight is retained until a target enters. Intersection ratios only trigger callbacks; they do not select the highlight. The browser only delivers entries for targets whose (isIntersecting, threshold index) changed (W3C IntersectionObserver). The model abstracts scroll position to the ordered "zones" in which every target keeps the same state (`out`, `low` = in the band below the middle threshold, `high`). The zone tables `StageZones`, `Stage2Zones` (first two stages, for a readable chart) and `SceneZones` are the sequences the real page goes through in Chromium at 1280x800. `probe.mjs` re-derives them on every run and reports a mismatch when they differ. One model step = one rendering update that moves by one zone, followed by its callback.

The probe also ties `Pick()` to the real callbacks: it scrolls the page down and back up in 8 px steps and, at every step, checks that the real highlight is one `Pick()` allows for that zone change (and that it does not move within a zone). Steps where a section outside the scene model's three-scene window (`capability`, `work`, `lab`) is in the band are outside the model and skipped; the probe prints how many.

Rules (INVARIANTS):

| Rule | Reader's sentence |
|---|---|
| `HighlightIsOnScreen` | While some section is in the reading band, the highlighted section is one of them. |
| `HighlightNeverGoesBack` | Scrolling down never moves the highlight to an earlier section, nor scrolling up to a later one. |

## Does my change touch this?

Yes if the diff touches `static/main.js` lines 38-100, any `data-scene`, `data-stage`, `data-stage-link` or `.stage-meter` markup in `templates/content/en.html` or `templates/content/fr.html`, or CSS in `static/styles.css` that changes the height, padding or gaps of `.concept-section`, `.threshold`, `.project-stage` or the stage articles.

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
| `CHROME` | Chrome Headless Shell 156.0.8078.4 (Playwright's `chromium-headless-shell` v1248), the build the zone tables were measured with | `"$PW/node_modules/.bin/playwright-core" install chromium-headless-shell`; on Linux x64 the binary is `$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`. Another Chromium can lay the page out differently and report `MISMATCH`. |

A missing tool stops the check before anything runs, with `TOOLING MISSING: <what>` and exit 2.

## Run

From anywhere inside a checkout, no argument:

```sh
export TLA2TOOLS=/path/to/tla2tools.jar JAVA=/path/to/bin/java
export PW_CORE=/path/to/node_modules/playwright-core CHROME=/path/to/chrome-headless-shell
.claude/skills/verify-scroll-highlight/check.sh
```

It checks the working tree as it is on disk, committed or not. It copies the tracked and untracked files (never ignored files, never `.env*`) to a new `mktemp -d` directory, changes only the copy's bind address to 127.0.0.1 on a free port between 20000 and 32000, builds there (debug, `CARGO_TARGET_DIR` inside it), serves it, probes it, stops it, and deletes the build output at exit. Nothing is written into the checkout. About 165 s: the build, an 8 px scroll scan of the home page down and back up, three replays, two TLC runs (`-workers 1`, `-Xmx2g -XX:+UseParallelGC`, under `timeout 300`, 61 and 25 distinct states).

Isolation: Chromium runs with `--host-resolver-rules` that leave only 127.0.0.1 resolvable, so the page's PostHog script never loads and no event leaves the machine. The probe prints the off-site hosts the page tried and which answered; an answer stops the check with exit 3. No secret and no `.env` is read.

## What to expect at the sync commit

```
ZONES stage OK: the page goes through the model's 13 zones in order
ZONES scene OK: the page goes through the model's 5 zones in order
CALLBACK stage OK: on 24 zone changes (down and up) and every step between, the real highlight is one Pick() allows (0 steps outside the window skipped)
CALLBACK scene OK: on 8 zone changes (down and up) and every step between, the real highlight is one Pick() allows (42 steps outside the window skipped)
C1 FIXED stage/HighlightNeverGoesBack: zones 3 -> 4 -> 5, highlight peaksys -> peaksys -> peaksys
C2 FIXED stage/HighlightIsOnScreen: zones 3 -> 4 -> 3, highlight peaksys -> peaksys -> peaksys
C3 FIXED scene/HighlightIsOnScreen: zones 1 -> 2 -> 1, highlight capability -> capability -> capability
off-site hosts the page tried: eu-assets.i.posthog.com; answered: none
SAME    stage.cfg: breaks [  ] = known findings none (see run for state count)
SAME    scene.cfg: breaks [  ] = known findings none (see run for state count)
RESULT: EXPECTED; known findings none; fixed replays pass and every rule holds
```

Exit status:

| Exit | Final line starts with | Meaning |
|---|---|---|
| 0 | `RESULT: EXPECTED` | The page follows the model zones and `Pick()`, C1 to C3 follow the fixed replay expectations, and TLC finds no invariant violation. |
| 1 | `RESULT: CHANGED (...)` | `model-out-of-date` (zones, observer options or a callback's choice differ from the model: TLC's answer would be about another page), `Cn-replay` (the real page no longer follows that known path), or `stage.cfg`/`scene.cfg` (TLC breaks other rules). |
| 2 | `RESULT: TOOLING MISSING (...)` | A tool above is missing. Nothing was checked. |
| 3 | `RESULT: CHECK FAILED (...)` | The copy does not build, the server did not start, the probe crashed, TLC did not finish, or the isolation leaked. |

## Read the result

Read every TLC result with the `/statechart` skill on `ScrollTracking.tla`, a config from this folder, and `view.mjs` (set `SCROLL_OBSERVER` to the config's `Observer`: `stage`, `stage2` or `scene`). Use `stage2.cfg` for a chart; `stage.cfg` has too many arrows to read.

- **CHANGED (model-out-of-date)**: copy the real sequence printed after `MISMATCH` into the zone table, the options into `expectedOptions` in `probe.mjs`, rerun, read the new TLC paths with `/statechart`, and point the replays in `probe.mjs` at the new shortest paths (zone numbers are 1-based, as in the spec). Replays of a kind whose zones mismatch print `NOT RUN`.
- **CHANGED (model-out-of-date) with `MISMATCH <kind> callback`**, or **CHANGED (Cn-replay) with zones OK**: the callback logic changed. Rewrite `Pick()` (and the actions) to say what the new code does with a batch of entries, one callback per step, then rerun. If the change was a fix, the replay no longer reproducing is the evidence.
- **CHANGED (stage.cfg or scene.cfg)**: a new broken rule is a candidate bug; add its path to the replays in `probe.mjs`. Only a `REPRODUCED` replay makes it a bug.

## Known findings at the sync commit

None. C1, C2 and C3 are retired. The original batch-only callbacks reproduced all three on main at `1023914`; the fixed callbacks pass the same paths. `FIXED_IDS` in `check.sh` requires each replay to print `FIXED`. The expected broken-rule lists for both configs are empty. No rule or zone bound was weakened.

For an intended change, mirror the callback in `Pick()` and the probe's `pick`, rerun, and update replay expectations only with evidence from the real page. Keep every remaining known finding in `KNOWN_IDS` and its config's expected list. Retire a finding only when its replay is fixed and its rule holds in TLC. Record the checked code commit below.

## Prove the check can turn red

Mutation M3 from the analysis: lower the middle threshold of `sectionObserver`.

```sh
sed -i 's/threshold: \[0, 0.25, 0.5\]/threshold: [0, 0.1, 0.5]/' static/main.js
.claude/skills/verify-scroll-highlight/check.sh; echo "exit=$?"
git checkout -- static/main.js
```

Expected: `MISMATCH scene observer options ...`, `MISMATCH scene zones: ...`, `C3 NOT RUN ...`, `CHANGED: MODEL OUT OF DATE ...`, `RESULT: CHANGED (model-out-of-date C3-replay); ...`, exit 1. The `git checkout` undoes it.

Restore the original batch-only callbacks without changing any zones.

```sh
git show 1023914:static/main.js > static/main.js
.claude/skills/verify-scroll-highlight/check.sh; echo "exit=$?"
git restore -- static/main.js
```

Expected: callback `MISMATCH` lines, all three fixed replays fail, `RESULT: CHANGED (model-out-of-date C1-replay C2-replay C3-replay)`, exit 1. TLC still holds on the fixed model, so the probe is what rejects the stale implementation. Only run these mutations with a clean `static/main.js` and restore it afterwards.

## Coverage and sync

- Covered: `static/main.js` lines 38-100 (both observers and their options); the `[data-scene]`, `[data-stage]`, `[data-stage-link]` markup of `templates/content/en.html` at the measured layout; the section heights that produce the zone tables (via the probe).
- Not covered: viewports other than 1280x800 (the probe can be pointed at another size by editing it; the zone tables may then differ); the French page (same markup, other text lengths); several callbacks merged into one when the main thread is busy; anchor jumps from the stage links; the pointer effect (`main.js:20-36`) and the capability filter (`main.js:102-122`).
- Sync commit: **d4611ef**, the product fix checked on 2026-11-10, based on main `1023914`. The model, probe and fixed replay expectations describe its callbacks. The baseline reproduced C1-C3 with exit 0; the updated check on the fix gives `RESULT: EXPECTED` with no known findings. Restoring the baseline `static/main.js` makes the updated check fail.
- Product regressions: `npm ci`, `npx playwright-core install --with-deps chromium-headless-shell`, `npm test`. See `tests/README.md`. CI runs both locales on pull requests and main and gates deploy on the browser job. Those tests cover exits and jumps beyond the formal model's adjacent-zone assumption; they do not extend the TLC proof to arbitrary viewports or delayed callbacks.
