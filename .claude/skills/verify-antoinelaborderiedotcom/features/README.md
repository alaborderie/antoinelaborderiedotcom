# antoinelaborderie.com verification map

This directory is the maintained source for verifying what visitors, crawlers and the deploy pipeline get from the site. Read this index before you drive, then use the matching feature file as the recipe.

## Baseline preconditions

- Run every command from the repository root. `V` is `.claude/skills/verify-antoinelaborderiedotcom/verify.mjs`.
- `$V launch` built this checkout and `$V doctor` reports `healthy`. For production, `$V doctor --target prod` reports `healthy`.
- The site has no accounts, no stored data and no form. Every page is reachable without state, so no recipe needs seed data or a reset.
- Never drive an instance that `launch` did not start. Production is the one exception, and only with GET requests.

## Driving conventions

- One check id in a feature file is one check in `features.mjs`. `$V list` prints them all.
- `$V drive <feature>` runs every check of that feature. Add `--target prod` to run them against production.
- Checks that say `local only`, `image only` or `prod only` print `N/A` on the other targets.
- Prefer ARIA roles and accessible names, then `href`, then the `data-*` attributes that `static/main.js` reads. Do not use coordinates or tab order.
- English pages are `/` and `/legal-notice`. French pages are `/fr` and `/fr/mentions-legales`. A check that names both locales runs the journey once per locale.
- A page counts as open at `DOMContentLoaded`. Each page carries its own CSS and JavaScript, and the `load` event also waits for the PostHog script from another host. One production drive on 2026-11-13 timed out waiting for `load`.
- Canonical links, alternates, the sitemap and the www redirect name `https://antoinelaborderie.com` on every target, including a local instance.

## Proof and skip reporting

- The proof of a check is its block in `run.log`, with the target and commit on the first line of that file.
- Browser proof adds the screenshots the check saved next to `run.log`.
- Command proof adds the `.log` file with the full output of each command.
- Report a check that did not run with its `N/A` line and the target that still has to run it.
- Do not report a `local` pass as proof of production, or a `prod` pass as proof of an unmerged change.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph that describes the behavior a user sees. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists each check id with one line for its behavior.
2. `How to get to it (user POV)` lists every entry point.
3. `Driving it with verify.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with the check that drives it and the observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands and observable proof.

## Features

- [Home page](./home.md) covers the English and French home pages, their navigation, services, contact links, social preview and the page without JavaScript.
- [Home page interactions](./interactions.md) covers the capability filter, the selected work index, the scroll highlight, project details and the pointer light.
- [Legal notice](./legal-notice.md) covers both legal pages and the links between them and the home pages.
- [Redirects](./redirects.md) covers old links, trailing slashes, query strings and the www host.
- [Not found](./not-found.md) covers the bilingual 404 page for pages and static files.
- [Crawlers and assets](./crawlers-and-assets.md) covers robots.txt, the sitemap, the favicon, static files, compression and cache and transport headers.
- [Analytics](./analytics.md) covers cookieless PostHog on the home pages and its absence everywhere else.
- [Build and deploy](./build-and-deploy.md) covers the CI commands, the Docker image, the deploy pipeline on `main` and the release that production serves.
