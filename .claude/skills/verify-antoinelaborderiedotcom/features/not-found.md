# Not found

A URL that matches no page shows a 404 page in the language of the URL, with a short message in the other language and links to both home pages. The answer has status 404, is not cached and is not indexed. A missing file under `/static/` gets the same page.

## Sub-features

- `not-found-page` shows the 404 page in English for `/missing` and in French for `/fr/missing`, and leads back to the home page of that language.
- `not-found-other-language` offers the home page in the other language, from the English and from the French 404 page.
- `not-found-static` answers a missing static file with the same uncached HTML page, in French under `/static/fr/`.

## How to get to it (user POV)

- Open any path that is not a page, for example `/missing`.
- Open any path under `/fr/` that is not a page, for example `/fr/missing`.
- Request a file that does not exist under `/static/`.

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.

- **Open a missing page.** Open `/missing`, then `/fr/missing`. Run `$V drive not-found`, check `not-found-page`. Each answers 404 with `Cache-Control: no-store`, `html[lang]` of `en` then `fr`, a `robots` meta of `noindex`, and both `Page not found` and `Page introuvable` in the main content. The link `Back to home` leads to `/`, and `Retour à l’accueil` leads to `/fr`.
- **Change language.** On `/missing`, choose `Accueil en français`. On `/fr/missing`, choose `Home in English`. Check `not-found-other-language`. The address becomes `/fr`, then `/`.
- **Request a missing file.** Request `/static/missing.css` and `/static/fr/missing.css`. Check `not-found-static`. Each answers 404 as `text/html; charset=utf-8` with `Cache-Control: no-store`, in English then in French.
- **Proof.** `not-found.not-found-page.en.png` and `not-found.not-found-page.fr.png`, with the `not-found/` blocks of `run.log`.

## Gotchas

- Only a path that starts with `/fr/` or `/static/fr/` gets the French page. `/french` and `/frmissing` get the English one.
- The French link text uses a typographic apostrophe (`’`). A straight quote does not match.
- A browser shows the page for a 404 as it does for a 200. Read the response status, not only the screen.
- The 404 page loads no analytics. `analytics/analytics-absent-elsewhere` checks that.
