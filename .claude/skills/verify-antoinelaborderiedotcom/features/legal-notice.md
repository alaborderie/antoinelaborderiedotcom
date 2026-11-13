# Legal notice

The legal notice names the publisher, the host and the audience measurement of the site, in English at `/legal-notice` and in French at `/fr/mentions-legales`. A visitor reaches it from the footer of any page and can switch its language or go back to the home page.

## Sub-features

- `legal-page` serves each locale as an indexable page with publisher, host and audience measurement sections.
- `legal-navigation` links the home pages and the two legal pages to each other.

## How to get to it (user POV)

- Choose `Legal notice` in the footer of `/`, or `Mentions légales` in the footer of `/fr`.
- Choose the same link in the footer of a legal page or a 404 page.
- Choose `FR` or `EN` in the navigation of a legal page.
- Open `/legal-notice` or `/fr/mentions-legales`.

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.

- **Open each locale.** Open `/legal-notice` and `/fr/mentions-legales`. Run `$V drive legal-notice`, check `legal-page`. Each answers 200 with `Cache-Control: public, max-age=300`, `html[lang]` of the locale, one `h1`, its own canonical URL, alternates for `en`, `fr` and `x-default`, and no `robots` meta. The headings `#publisher-title`, `#host-title` and `#analytics-title` are visible. The publisher section shows a SIRET number, the main content has one `mailto:` link, and the audience measurement section names `PostHog Cloud EU`.
- **Walk the links.** From `/`, choose `Legal notice` in the footer, `FR` in the navigation, `Accueil` in the footer, `Mentions légales` in the footer, `EN` in the navigation, then the `AL/26` mark. Check `legal-navigation`. The address goes `/legal-notice`, `/fr/mentions-legales`, `/fr`, `/fr/mentions-legales`, `/legal-notice`, `/`.
- **Proof.** `legal-notice.legal-page.en.png` and `legal-notice.legal-page.fr.png`, with the `legal-notice/` blocks of `run.log`.

## Gotchas

- The legal text must match what the home page does with analytics. [Analytics](./analytics.md) proves the behavior. A change to the PostHog options needs a change to both legal texts.
- Three facts in the text live in the PostHog project settings and not in this repository: cookieless tracking, discarded client IP data and 13 months of retention. This map cannot see them.
- Legal pages load no analytics. `analytics/analytics-absent-elsewhere` checks that.
- The trailing-slash forms `/legal-notice/` and `/fr/mentions-legales/` redirect. See [Redirects](./redirects.md).
