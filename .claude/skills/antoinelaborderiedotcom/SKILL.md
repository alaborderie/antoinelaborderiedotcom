---
name: antoinelaborderiedotcom
description: >
  Architecture and editing context for Antoine Laborderie's bilingual portfolio (antoinelaborderie.com). Use when updating its content, fixing the Rust/Axum/Askama application, or preparing its deployment.
metadata:
  author: alaborderie
  version: 1.1.0
---

# antoinelaborderiedotcom — Personal Portfolio

**Repo**: https://github.com/alaborderie/antoinelaborderiedotcom
**Live**: https://antoinelaborderie.com
**Status**: Active

Run every command from the repository root.

## Purpose

Bilingual freelance portfolio (English at `/`, French at `/fr`) for Antoine Laborderie, a Bordeaux-based full-stack engineer focused on DevEx, AI, and agentic coding.

Public offer: fixed-price projects, quote on request. Contact is `mailto:antoine.laborderie@gmail.com` and the Malt profile. Keep that offer. The home-page tests reject the strings `€600` and `600 €`.

## Architecture

```
.
├── src/
│   ├── main.rs                 — Axum server, routes, handlers, tests (port 3000)
│   └── structured_data/        — JSON-LD included into the home pages
│       ├── en.json
│       └── fr.json
├── templates/                  — Askama templates (compiled into the binary)
│   ├── index.html              — Home shell: SEO, Open Graph, Umami, JSON-LD
│   ├── content/en.html         — English home copy
│   ├── content/fr.html         — French home copy
│   ├── page.html               — Shared chrome for legal and 404 pages
│   ├── legal.html
│   └── 404.html
├── static/                     — Runtime assets (CSS, JS, portrait, social image)
├── Cargo.toml
├── Dockerfile
└── .github/workflows/rust.yml  — CI, image publish, deployment restart
```

One Rust binary serves every page. Askama compiles `templates/` into the binary at build time. `static/` is read from the process working directory at runtime.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Rust 2021, Axum 0.8, Tokio |
| Templates | Askama 0.13, directory `templates/` |
| HTTP | Tower and tower-http (static files, gzip, brotli) |
| Styling | Hand-written CSS in `static/styles.css` |
| Client script | `static/main.js` (progressive enhancement) |
| Analytics | Umami on the home page only (`templates/index.html`) |
| Structured data | `src/structured_data/{en,fr}.json` |

`static/main.js` adds pointer lighting, scene color, and the selected-work index. Pages stay usable without it: the document starts as `studio-no-js`.

## Routes

| Path | Behavior |
|------|----------|
| `/` | English home |
| `/fr` | French home |
| `/legal-notice`, `/fr/mentions-legales` | Localized legal notice |
| `/en`, trailing slashes, `/concept`, `/concept-spatial` | Permanent redirects to `/` or `/fr` |
| `www.antoinelaborderie.com` | 301 to the apex, preserving path and query. TLS terminates upstream, so the app only redirects the `www` host |
| `/robots.txt`, `/sitemap.xml` | Sitemap lists `/`, `/fr`, and both legal URLs, with `lastmod` from `LAST_MODIFIED` |
| `/favicon.ico` | `static/favicon.svg` |
| `/static/*` | `ServeDir` over `static/` |
| anything else | Bilingual 404 (`noindex`) |

Response policy in `http_policy`: HSTS `max-age=31536000`; HTML `public, max-age=300`; static assets `public, max-age=86400`; errors `no-store`. Home templates append `?v={ASSET_VERSION}` to CSS, JS, and the Open Graph image.

## Page sections

Home anchors, in order: `#services`, `#about`, `#skills`, `#projects`, project lab, `#experience`, `#contact`.

- **Services** — five fixed-price offers: DevEx & AI audit, agentic coding kit, AI integration MVP, internal tooling / Backstage portal, multi-repository automation
- **Approach** — senior engineer, TypeScript, Node.js, React, Rust, Kubernetes, developer portals
- **Expertise** — platform engineering, Kubernetes and delivery, AI engineering, software development, cloud and data, observability
- **Selected work** — Peaksys, HelloWork, Royal Canin
- **Project lab** — scalingo-rust-buildpack, ng2-ad-dfp, json-translate, Cosmo Connected, Michel Paris, Drivn
- **Trajectory** — 2020 frontend, 2024 full-stack and cloud, 2025 developer platforms
- **Contact** — Bordeaux, remote, FR/EN, fixed-price, email and Malt

Visible copy, `<title>`, meta description, and JSON-LD service names are the same facts in two languages. `src/main.rs` tests assert the English and French strings, the five service names, canonical URLs, and the absence of a day rate.

## Editing content

Change both languages together:

1. `templates/content/en.html` and `templates/content/fr.html`
2. Titles, descriptions, and canonicals in `english()` / `french()` in `src/main.rs`
3. `src/structured_data/en.json` and `src/structured_data/fr.json`
4. The matching assertions in `src/main.rs` (`cargo test`)

When the public content revision date changes, update `LAST_MODIFIED` (sitemap `lastmod` only). When `static/styles.css`, `static/main.js`, or a social image changes, bump `ASSET_VERSION` in `src/main.rs`. Both constants are dates of the content or asset revision, not the request or build time.

Legal copy is `templates/legal.html` (publisher, OVH host, Umami). It extends `templates/page.html`.

## Local development

```bash
cargo run
```

Open http://localhost:3000. The listener binds `0.0.0.0:3000`.

Checks that match CI:

```bash
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test
cargo build --release
```

Template edits need a rebuild. Askama fails the build when a template does not compile.

## Deployment

Workflow: `.github/workflows/rust.yml`.

On every pull request and on every push to `main`:

1. `build` — `cargo build --release`
2. `fmt` — `cargo fmt -- --check`
3. `clippy` — `cargo clippy -- -D warnings`
4. `test` — `cargo test`

On `main` only, after those four jobs:

5. `deploy` builds `Dockerfile` and pushes `ghcr.io/alaborderie/antoinelaborderiedotcom:latest` (GHCR login uses `secrets.PAT_TOKEN`)
6. `rollout` SSHes to the VPS and runs `sudo kubectl rollout restart deployment landing-website`

The Kubernetes manifest lives outside this repository. The workflow publishes the image and restarts `deployment/landing-website`. The legal notice names OVH SAS as the host.

The image is a multi-stage build: `cargo install --path .` in the Rust stage, then a Debian stage with the binary and `static/` copied to `/app/static`. Templates are already inside the binary. The container `WORKDIR` is `/app`, which is what `ServeDir::new("static")` expects.

## Key files

| File | Purpose |
|------|---------|
| `src/main.rs` | Routes, cache and host policy, page metadata, tests |
| `src/structured_data/` | Schema.org JSON-LD for both locales |
| `templates/` | Askama HTML |
| `static/styles.css` | All styling |
| `static/main.js` | Progressive enhancement |
| `Cargo.toml` | Package manifest |
| `Dockerfile` | Runtime image (binary + `static/`) |
| `.github/workflows/rust.yml` | CI, GHCR publish, rollout restart |

## Agent notes

- Keep English and French copy, metadata, and JSON-LD aligned, then update the tests that lock those strings.
- Public pricing stays fixed-price, quote on request.
- CSS and JS are source files served as-is.
- A content change is not live until the `main` workflow pushes the image and the rollout restarts `landing-website`.
