# Build and deploy

A change reaches visitors in three steps. The CI commands pass on the pull request. A push to `main` runs them again, then builds the Docker image, pushes it and restarts the deployment. Production then serves the release that is on `main`. Antoine and his agents are the users of this feature.

## Sub-features

- `ci-checks` runs the five commands that gate a pull request. Local only.
- `image-serves` proves that the Docker image serves the pages and the `static/` files of this checkout. Image only.
- `deploy-pipeline` proves that the newest `rust.yml` run on `main` is for `origin/main` and that all seven jobs succeeded. Prod only.
- `live-release` proves that production serves the CSS, JavaScript and version constants of `origin/main`. Prod only.

## How to get to it (user POV)

- Open a pull request. GitHub runs the `build`, `fmt`, `clippy`, `test` and `browser` jobs of `.github/workflows/rust.yml`.
- Merge to `main`. The same workflow runs the five jobs again, then `deploy` once all five pass, then `rollout`.
- Open `https://antoinelaborderie.com` after the rollout.

## Driving it with verify.mjs

Preconditions:

- For `ci-checks`, a `local` instance is recorded. The commands run in the checkout and do not use the instance.
- For `image-serves`, `$V launch --target image` built the image and `$V doctor` reports `healthy`.
- For the two `prod` checks, `gh` is logged in with read access to the repository and `git fetch origin main` works.

- **Run the CI commands.** Run `$V drive build-and-deploy` on a `local` instance, check `ci-checks`. `cargo fmt -- --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release` and `npm test` each exit 0. Each command's output is saved next to `run.log`.
- **Serve from the image.** Run `$V launch --target image`, then `$V drive build-and-deploy`, check `image-serves`. `/`, `/fr`, `/static/styles.css` and `/static/og-image.png` answer 200, and `/static/main.js` has the bytes of the checkout. Run `$V drive all` on the image when the diff touches `Dockerfile`, `.dockerignore` or `static/`.
- **Read the pipeline.** Run `$V drive build-and-deploy --target prod`, check `deploy-pipeline`. The driver fetches `origin/main`, then runs `gh run list --workflow rust.yml --branch main --limit 1`. That run is `completed` with conclusion `success`, its commit is `origin/main`, and `gh run view` lists `build`, `fmt`, `clippy`, `test`, `browser`, `deploy` and `rollout` as `success`.
- **Compare the live release.** Same command, check `live-release`. `/static/styles.css` and `/static/main.js` on production have the bytes of `origin/main`. The home page's social image URL carries the `ASSET_VERSION` of `origin/main`, and the sitemap's `lastmod` is its `LAST_MODIFIED`.
- **Proof.** The `build-and-deploy/` blocks of `run.log` with the run id and commit, and the saved command logs.

## Gotchas

- `deploy-pipeline` fails while a run on `main` is queued or in progress, and for a few minutes after a merge. Wait for the run to end, then drive again. Do not count the earlier run.
- `rollout` restarts the deployment and returns before the new pod serves. `live-release` is the check that sees the new release.
- `live-release` compares files that a release may leave unchanged. After a change that touches only templates or Rust code, drive the changed feature with `--target prod` to see it live.
- The Kubernetes manifest, the ingress and the TLS certificate live in another repository. This map sees them only through what production answers.
- `npm test` starts the Chromium headless shell unless `CHROME` names another browser. Install the shell with `npx playwright-core install --with-deps chromium-headless-shell`, as CI does.
- The driver never pushes an image, restarts a deployment or reruns a workflow. A red pipeline is reported, not repaired.
