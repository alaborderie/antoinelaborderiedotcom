---
name: verify-scroll-highlight
description: Model-check (TLA+/TLC) the "you are here" highlight that static/main.js keeps while a visitor scrolls the antoinelaborderie.com home page (aria-current on the Selected work stage links, body[data-active-scene] and --scene), with a Chromium probe that ties the model to the real page. Use before changing the IntersectionObserver code or options in static/main.js, the data-scene / data-stage / data-stage-link markup in templates/content/{en,fr}.html, or CSS that changes the height of those sections.
---

# verify-scroll-highlight

**Promise.** While you scroll the home page, the highlighted section (stage link with `aria-current="location"`, accent color, `body[data-active-scene]`) is a section you are actually reading, and it only moves forward when you scroll down and backward when you scroll up.

**Harm when broken.** The navigation tells screen-reader and sighted visitors they are in a section they have left, or jumps back to the previous project while they scroll forward.

## What is checked

`ScrollTracking.tla` models one IntersectionObserver callback of `static/main.js`:

- `stageObserver` (`static/main.js:56-88`): targets `[data-stage]`, `rootMargin: "-18% 0px -45%"`, `threshold: [0, 0.2, 0.5]`; sets `aria-current`/`is-active` on `[data-stage-link]`, `--scene`, the stage meter.
- `sectionObserver` (`static/main.js:38-54`): targets `[data-scene]`, `rootMargin: "-30% 0px -45%"`, `threshold: [0, 0.25, 0.5]`; sets `body.dataset.activeScene` and `--scene`.

Both run `entries.filter(isIntersecting).sort(ratio desc)[0]` and `return` when nothing is left (`main.js:41-44`, `61-64`). The browser only delivers entries for targets whose (isIntersecting, threshold index) changed (W3C IntersectionObserver). The model abstracts scroll position to the ordered "zones" in which every target keeps the same state (`out`, `low` = in the band below the middle threshold, `high`). The zone tables `StageZones`, `Stage2Zones` (first two stages, for a readable chart) and `SceneZones` are the sequences the real page goes through in Chromium at 1280x800. `probe.mjs` re-derives them on every run and reports a mismatch when they differ. One model step = one rendering update that moves by one zone, followed by its callback.

The probe also ties `Pick()` to the real callbacks: it scrolls the page down and back up in 8 px steps and, at every step, checks that the real highlight is one `Pick()` allows for that zone change (and that it does not move within a zone). Steps where a section outside the scene model's three-scene window (`capability`, `work`, `lab`) is in the band are outside the model and skipped; the probe prints how many.

Rules (INVARIANTS):

| Rule | Reader's sentence |
|---|---|
| `HighlightIsOnScreen` | While some section is in the reading band, the highlighted section is one of them. |
| `HighlightNeverGoesBack` | Scrolling down never moves the highlight to an earlier section, nor scrolling up to a later one. |

## Does my change touch this?

Yes if the diff touches `static/main.js` lines 38-88, any `data-scene`, `data-stage`, `data-stage-link` or `.stage-meter` markup in `templates/content/en.html` or `templates/content/fr.html`, or CSS in `static/styles.css` that changes the height, padding or gaps of `.concept-section`, `.threshold`, `.project-stage` or the stage articles.

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
C1 REPRODUCED stage/HighlightNeverGoesBack: zones 3 -> 4 -> 5, highlight peaksys -> hellowork -> peaksys
C2 REPRODUCED stage/HighlightIsOnScreen: zones 3 -> 4 -> 3, highlight peaksys -> hellowork -> hellowork
C3 REPRODUCED scene/HighlightIsOnScreen: zones 1 -> 2 -> 1, highlight capability -> work -> work
off-site hosts the page tried: eu-assets.i.posthog.com; answered: none
SAME    stage.cfg: breaks [ HighlightIsOnScreen HighlightNeverGoesBack ] = known findings C1 C2 (61 distinct states found)
SAME    scene.cfg: breaks [ HighlightIsOnScreen ] = known findings C3 (25 distinct states found)
RESULT: EXPECTED; known findings C1 C2 C3 still reproduce (TLC and replay) and every other rule holds
```

Exit status:

| Exit | Final line starts with | Meaning |
|---|---|---|
| 0 | `RESULT: EXPECTED` | The page still goes through the model's zones, its callbacks still pick what `Pick()` allows, C1 to C3 still reproduce on the real page, TLC breaks exactly the known rules. The state of the code today. |
| 1 | `RESULT: CHANGED (...)` | `model-out-of-date` (zones, observer options or a callback's choice differ from the model: TLC's answer would be about another page), `Cn-replay` (the real page no longer follows that known path), or `stage.cfg`/`scene.cfg` (TLC breaks other rules). |
| 2 | `RESULT: TOOLING MISSING (...)` | A tool above is missing. Nothing was checked. |
| 3 | `RESULT: CHECK FAILED (...)` | The copy does not build, the server did not start, the probe crashed, TLC did not finish, or the isolation leaked. |

## Read the result

Read every TLC result with the `/statechart` skill on `ScrollTracking.tla`, a config from this folder, and `view.mjs` (set `SCROLL_OBSERVER` to the config's `Observer`: `stage`, `stage2` or `scene`). Use `stage2.cfg` for a chart; `stage.cfg` has too many arrows to read.

- **CHANGED (model-out-of-date)**: copy the real sequence printed after `MISMATCH` into the zone table, the options into `expectedOptions` in `probe.mjs`, rerun, read the new TLC paths with `/statechart`, and point the replays in `probe.mjs` at the new shortest paths (zone numbers are 1-based, as in the spec). Replays of a kind whose zones mismatch print `NOT RUN`.
- **CHANGED (model-out-of-date) with `MISMATCH <kind> callback`**, or **CHANGED (Cn-replay) with zones OK**: the callback logic changed. Rewrite `Pick()` (and the actions) to say what the new code does with a batch of entries, one callback per step, then rerun. If the change was a fix, the replay no longer reproducing is the evidence.
- **CHANGED (stage.cfg or scene.cfg)**: a new broken rule is a candidate bug; add its path to the replays in `probe.mjs`. Only a `REPRODUCED` replay makes it a bug.

## Known findings at the sync commit

All replayed in Chrome Headless Shell 156 on the real page:

1. **C1**, `stage.cfg`, `HighlightNeverGoesBack`: (0) reading Peaksys, highlight Peaksys; (1) you scroll down, HelloWork enters the band, highlight HelloWork; (2) you scroll down, Peaksys drops under 20 % of its height in the band and its entry is the only one delivered, highlight back on Peaksys. Zones 3 -> 4 -> 5.
2. **C2**, `stage.cfg`, `HighlightIsOnScreen`: (0) reading Peaksys; (1) you scroll down, highlight HelloWork; (2) you scroll back up, HelloWork leaves the band, its entry is not intersecting, the callback returns early: `aria-current="location"` stays on HelloWork while only Peaksys is in view. Zones 3 -> 4 -> 3.
3. **C3**, `scene.cfg`, `HighlightIsOnScreen`: the same early return in `sectionObserver`: Expertise -> (Selected work enters) -> back up: `data-active-scene="work"` while only Expertise is in view. Zones 1 -> 2 -> 1. `HighlightNeverGoesBack` holds for scenes because no section ratio reaches 0.25.

The cause of all three is that the callback decides from the entries of one batch only, not from every target currently in the band.

When a fix lands on purpose and the replay no longer reproduces a finding, retire it in `check.sh`: remove its id from `KNOWN_IDS` and the rule from the expected list of its config in the `for cfg in` loop, and update this section and the expected output above. If the fix changes the zones, update the model first (see "Read the result").

## Prove the check can turn red

Mutation M3 from the analysis: lower the middle threshold of `sectionObserver`.

```sh
sed -i 's/threshold: \[0, 0.25, 0.5\]/threshold: [0, 0.1, 0.5]/' static/main.js
.claude/skills/verify-scroll-highlight/check.sh; echo "exit=$?"
git checkout -- static/main.js
```

Expected: `MISMATCH scene observer options ...`, `MISMATCH scene zones: ...`, `C3 NOT RUN ...`, `CHANGED: MODEL OUT OF DATE ...`, `RESULT: CHANGED (model-out-of-date C3-replay); ...`, exit 1. The `git checkout` undoes it.

A callback change the zones cannot see: highlight Expertise whenever the section callback picks the Project lab.

```sh
sed -i 's/      const scene = visible.target.dataset.scene;/      const scene = visible.target.dataset.scene === "lab" ? "capability" : visible.target.dataset.scene;/' static/main.js
.claude/skills/verify-scroll-highlight/check.sh; echo "exit=$?"
git checkout -- static/main.js
```

Expected: `MISMATCH scene callback: ... zone 3 -> 4 scrolling down (y ...): highlight work -> capability, model allows lab`, `RESULT: CHANGED (model-out-of-date); ...`, exit 1.

## Coverage and sync

- Covered: `static/main.js` lines 38-88 (both observers and their options); the `[data-scene]`, `[data-stage]`, `[data-stage-link]` markup of `templates/content/en.html` at the measured layout; the section heights that produce the zone tables (via the probe).
- Not covered: viewports other than 1280x800 (the probe can be pointed at another size by editing it; the zone tables may then differ); the French page (same markup, other text lengths); several callbacks merged into one when the main thread is busy; anchor jumps from the stage links; the pointer effect (`main.js:20-36`) and the capability filter (`main.js:90-110`).
- Sync commit: **7b125e4**, the `origin/main` this skill was added from. On 2026-11-09 the anchors above were read at that commit and `check.sh`, run from this repository's checkout, gave `RESULT: EXPECTED` (exit 0); M3 gave `RESULT: CHANGED` (exit 1). Move it forward only after `check.sh` at the new commit gives `EXPECTED`, or after you updated the model and findings with replayed evidence.
