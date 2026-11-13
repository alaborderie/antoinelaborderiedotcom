# Home page

The home page presents Antoine Laborderie's freelance offer in English at `/` and in French at `/fr`. A visitor reads seven sections, moves between them from the top navigation, switches language, and contacts Antoine by email or on Malt. The site has no form. Search engines and link previews get a title, a description, canonical and alternate links, structured data and a social image.

## Sub-features

- `home-page` serves each locale as an indexable page with its language, one `h1`, canonical and alternate links, and the six section anchors.
- `home-nav` scrolls to a section from each link of the top navigation and from the hero's link to the services.
- `home-services` shows five service cards whose names match the services in the page's JSON-LD.
- `home-language-switch` moves between `/` and `/fr` from the navigation.
- `home-contact` offers three email links with the same address and subject, and one Malt profile link.
- `home-without-javascript` shows all content and opens project details when JavaScript is off.
- `home-social-preview` names a social image that exists and is a PNG.

## How to get to it (user POV)

- Open `/` for English or `/fr` for French.
- Choose `FR` or `EN` in the top navigation of the other home page or of a 404 page. On a legal page that switch leads to the other legal page.
- Choose the `AL/26` mark or the home link in the footer of a legal or 404 page.
- Choose `Back to home` or `Accueil en français` on a 404 page (`Retour à l’accueil` or `Home in English` on the French one).
- Follow an old link that redirects to a home page. See [Redirects](./redirects.md).

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.

- **Open each locale.** Open `/` and `/fr`. Run `$V drive home`, check `home-page`. Each answers 200 with `Cache-Control: public, max-age=300`, `html[lang]` of the locale, exactly one `h1`, a title, a meta description, its own canonical URL, alternates for `en`, `fr` and `x-default`, no `robots` meta, and one element for each of `#services`, `#about`, `#skills`, `#projects`, `#experience` and `#contact`.
- **Use the navigation.** In the navigation named `Primary navigation` (`Navigation principale` in French), choose the links to `#services`, `#skills`, `#projects` and `#contact`. Check `home-nav`. After each click the section's top edge is within the upper half of the viewport. Back at the top, the hero link `See services` (`Voir les offres`), `header a.button-secondary`, scrolls to `#services` too.
- **Read the services.** Check `home-services`. `#services` holds five `article` cards. Their `h3` names equal the `name` of the five `Service` items in the `application/ld+json` script.
- **Switch language.** Choose the link `FR` in the navigation, then `EN`. Check `home-language-switch`. The address becomes `/fr` with `lang="fr"`, then `/` with `lang="en"`.
- **Contact.** Check `home-contact`. The page has three `mailto:` links (navigation, hero, closing section) with one identical `href`, one link to `https://www.malt.fr/profile/...` that opens in a new tab, and no `form`, `input` or `textarea`.
- **Turn JavaScript off.** Open `/` in a context without JavaScript. Check `home-without-javascript`. `html` keeps the single class `studio-no-js`, no `.reveal`, service card, work scene or contact link is transparent or hidden, and a click on the first project's `summary` opens its `details`.
- **Preview a shared link.** Check `home-social-preview`. `og:locale` is `en_GB` or `fr_FR`, `twitter:card` is `summary_large_image`, `og:image` and `twitter:image` are the same `https://antoinelaborderie.com/static/og-image.png?v=...` URL, and that path answers 200 as `image/png`.
- **Proof.** `home.home-page.en.png`, `home.home-page.fr.png` and `home.home-without-javascript.no-js.png`, with the `home/` blocks of `run.log`.

## Gotchas

- The email links open the visitor's mail client. The driver reads their `href` and does not click them, so it proves the link target and not the delivery of a message.
- External links (Malt, GitHub, LinkedIn, project sites) are read, not followed. Their destinations are outside this site.
- The copy differs per locale. Assert structure and cross-checks such as cards against JSON-LD, not sentences, so a content edit in both languages does not break the map.
- `src/main.rs` tests lock exact English and French strings and reject a day rate. `build-and-deploy/ci-checks` runs them.
