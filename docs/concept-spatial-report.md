# Concept spatial — Constellation de livraison

## Direction

- Un univers bleu-noir, violet, bleu glacier et ambre met en scène le parcours réel d’Antoine sans reproduire un terminal, un cockpit ou des métriques artificielles.
- La livraison fiable forme le centre de trois orbites : Produit, Cloud & livraison, puis Platform & DevEx. Les expériences prennent place sur leur orbite et restent reliées à des dossiers textuels complets.
- Les routes `/concept-spatial` et `/concept-spatial/fr` complètent le concept studio existant. Des liens permettent de passer de l’une à l’autre pour comparer les directions.

## Interactions

- Les liens de la constellation déplacent brièvement la caméra, tracent la trajectoire sélectionnée et conduisent par une ancre native au dossier correspondant.
- L’index des dossiers suit la scène visible et expose son état avec `aria-current`.
- La lentille d’expertise met en évidence les projets associés par une bordure et une lueur, sans réduire le contraste des autres contenus.
- Les dossiers s’ouvrent avec `details` et `summary`. Les liens, contenus, coordonnées et fiches restent navigables sans JavaScript.
- `prefers-reduced-motion` désactive les déplacements, l’arrivée et la profondeur liée au pointeur.

## Isolation et aperçu

- Aperçu local : `http://localhost:3001/concept-spatial` et `http://localhost:3001/concept-spatial/fr`.
- Les routes sont volontairement en `noindex,follow`, possèdent leurs canoniques et alternates de langue, et restent absentes du sitemap.
- Les pages publiques et le concept studio sont conservés. Les mesures Lighthouse sont locales et ne garantissent pas les performances après déploiement.
