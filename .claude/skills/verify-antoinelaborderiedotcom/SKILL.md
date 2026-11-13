---
name: verify-antoinelaborderiedotcom
description: Drive antoinelaborderie.com the way a visitor, a crawler and the deploy pipeline do, and keep the proof. Launches the real release binary or the Docker image of this checkout, or reads production, then runs the feature map in `features/` over HTTP and in Chromium. Use to prove a change to pages, routes, redirects, client script, analytics, build or deployment, and as the target of /maintain-verification-skill. The three other verify-* skills are formal checks of one property each and have no feature map.
---

# verify-antoinelaborderiedotcom

Run every command from the repository root. `verify.mjs` is the only entry point. `features.mjs` holds the checks, one group per file in `features/`.

```sh
V=.claude/skills/verify-antoinelaborderiedotcom/verify.mjs
$V launch            # build this checkout and start it
$V doctor            # is that instance worth driving?
$V drive all         # every feature, or name some: $V drive redirects not-found
$V cleanup           # stop what launch started
$V drive all --target prod   # production, GET requests only
```

`$V list` prints every feature and check id with the targets it runs on. It exits 1 when a feature file, the index in `features/README.md` and the checks in `features.mjs` do not name the same features and check ids.

## Targets

| Target | What runs | Address | Use it for |
|---|---|---|---|
| `local` | `target/release/antoinelaborderiedotcom`, unmodified, from the repository root | `http://127.0.0.1:3000` | The default. Also runs the CI commands. |
| `image` | The image `Dockerfile` builds, the same build the `deploy` job pushes | `http://127.0.0.1:<random port>` | A change to `Dockerfile`, `.dockerignore` or `static/`, or when port 3000 is taken. |
| `prod` | `https://antoinelaborderie.com` | | After a merge to `main`, and in every maintenance pass. Read-only. |

A full pass is `drive all` on `local`, then `drive all --target prod`. Add `image` when the diff touches the image. A check that does not run on the current target prints `N/A` and counts as not run, never as passed.

## Launch

`$V launch [--target local|image]` does this:

1. Refuses when `instance.json` already records an instance. Run `cleanup` first.
2. Runs `npm ci` when `node_modules/playwright-core` is missing, and `npx playwright-core install chromium` when the full Chromium build is missing. Set `CHROME=/path/to/chrome` to use another full Chromium.
3. `local`: refuses when something already listens on port 3000, runs `cargo build --release`, then starts the binary detached with the repository root as working directory. `image`: runs `docker build`, then `docker run --detach --publish 127.0.0.1::3000`.
4. Records the instance in `target/verify-antoinelaborderiedotcom/instance.json`.
5. Waits until `GET /` and `GET /static/styles.css` both answer 200, then prints the address. The second request proves the process found `static/`, which it reads from its working directory at run time. When the instance never answers, `launch` runs `cleanup` and fails.

The site has no database, no seed data and no login. Needs: `cargo`, Node 22 or later, and for `image` a working `docker`. A cold `launch` took 13 s for `local` and 18 s for `image` on jarvis with warm caches.

Isolation. The binary binds `0.0.0.0:3000` and has no port setting, so one `local` instance runs per machine and it is reachable from the network while it runs. `launch` never stops a process it did not start. Each checkout records one instance, so two worktrees can each run an `image` instance at the same time.

## Doctor

`$V doctor` is read-only and exits non-zero when the instance is not worth driving. Run it before the first drive and after any drive that failed in a way you did not expect.

- `local`: the recorded process is alive, its executable is `target/release/antoinelaborderiedotcom`, its working directory is the repository root, port 3000 belongs to it, and the binary is newer than `src/`, `templates/`, `static/main.js`, `static/styles.css`, `static/favicon.svg`, `Cargo.toml` and `Cargo.lock`. Templates, CSS and JavaScript are compiled into the binary, so an edit to any of them makes the instance stale. Run `cleanup`, then `launch`.
- `image`: the container runs from the image this run built, with `/app` as working directory, the checkout is still at the commit the image was built from, and no build input, file of `static/`, `Dockerfile` or `.dockerignore` changed after the build.
- Both, and `--target prod`: `GET /` answers 200 with this site's canonical link.

## Drive

`$V drive <feature...|all> [--target prod]` runs each check and prints `PASS`, `FAIL` or `N/A` with what it observed. It exits 1 when a check fails.

- HTTP checks use `node:http` without redirect following, so each status, `Location` and header is the server's own answer.
- Browser checks use Playwright with Chromium at 1280x800, one fresh browser context per check. They click real links and buttons by ARIA role and name, `href`, or the `data-*` attributes the client script reads.
- The feature files in `features/` describe each journey and the end state that proves it. Read `features/README.md` first.

The driver never sends anything but GET requests to the site. In the browser it lets the PostHog script load and answers every request to `eu.i.posthog.com` itself, so no drive adds a page view to the analytics project, on any target.

## Evidence

Each `launch` and `drive` writes a new directory under `target/verify-antoinelaborderiedotcom/runs/<UTC stamp>-<command>-<target>/`:

- `run.log` is the transcript: target, commit, browser version, then each check with the requests it sent, the pages it opened and what came back.
- `results.json` has one entry per check with `pass`, `fail` or `not-run`.
- `<feature>.<check>.<label>.png` are screenshots of the end state. A failed browser check saves `<feature>.<check>.failure.png`.
- `<feature>.<check>.<command>.log` is the full output of each command a check ran (`cargo test`, `gh run view`).
- `server.log` in the launch directory is the server's output. For `image`, `cleanup` writes it from `docker logs`.

Proof standards for a claim that a feature works:

- Quote the `run.log` lines of the check, with the target and commit from its first line.
- A `local` or `image` pass proves this checkout. Only a `prod` pass proves what visitors get.
- An `N/A` line is not proof. Name the target that still has to run.
- A failure is the app's or the map's. Fix the map only when the app's behavior is the intended one. Never loosen a check to make it pass.

`target/` is ignored by git. `cargo clean` deletes the evidence, so copy what a report needs before you run it.

## Cleanup

`$V cleanup` stops only what `launch` recorded. For `local` it sends SIGTERM to the recorded process after it confirms that the process still runs this checkout's binary. For `image` it saves the container log, removes the container and removes the image tag. It then deletes `instance.json` and keeps `runs/`. It is safe to run twice.

## Gotchas

- PostHog drops page views from automated browsers. The SDK checks `navigator.webdriver` and the `HeadlessChrome` brand. The driver starts the full Chromium build with `--disable-blink-features=AutomationControlled` and removes `Headless` from the user agent, so the SDK behaves as it does for a visitor. The headless shell that `npm test` uses cannot drive the analytics checks.
- The analytics checks need outbound HTTPS to `eu-assets.i.posthog.com`. Without it they fail with a timeout that names the SDK.
- Chromium 156.0.8078.4, the build pinned by `playwright-core` 1.64.1, can crash the page when a second stage link is clicked on the same page after the first smooth scroll. Chromium 158.0.8127.18 and Firefox 157 run the same clicks without a crash, and so does Chromium 156 with reduced motion. The `selected-work-index` check opens a fresh page for each link for that reason. A `Target crashed` error anywhere else is new information.
- `launch --target local` fails when port 3000 is busy. Use `--target image` and leave the other process alone.
