# Concept de portfolio immersif

## Direction

- « Studio des systèmes vivants » traduit le travail réel d’Antoine en un parcours : signal, flux développeur, plateforme et livraison fiable.
- Une composition éditoriale grand format, des scènes contrastées et un fil de couleur remplacent la succession classique de cartes, sans reprendre les codes d’un faux terminal ou d’un tableau de bord.
- Les contenus, expériences, compétences, liens publics, disponibilité et tarif restent cohérents entre le français et l’anglais.

## Expérience proposée

- Le projet actif pilote l’index fixe, la couleur et la progression sur grand écran. La lecture redevient naturellement verticale sur mobile.
- Les fiches d’expérience utilisent `details` et `summary` : leur contenu reste consultable au clavier et sans JavaScript.
- Le choix d’une compétence souligne les réalisations associées sans masquer ni atténuer le texte des autres projets.
- Les animations d’entrée, le signal et la lumière de pointeur sont des améliorations progressives. `prefers-reduced-motion` les désactive et restitue directement tous les états lisibles.

## Isolation et vérification

- Aperçu local : `http://localhost:3000/concept` et `http://localhost:3000/concept/fr`.
- Les deux routes portent volontairement `noindex,follow`, disposent de leurs propres URL canoniques et restent absentes du sitemap. Les pages publiques `/` et `/fr` ne sont pas modifiées.
- Vérifications locales : mise en page sans débordement à 320, 390, 768 et 1440 px en FR et EN ; navigation clavier ; mode sans JavaScript ; réduction des animations ; tests HTTP Axum ; compilation Rust de production.
- Lighthouse mobile local : 100 en performance, accessibilité et bonnes pratiques sur les deux langues. Le score SEO de 66 reflète l’exclusion volontaire de l’indexation ; ce concept n’est pas encore déployé et les mesures locales ne garantissent pas les performances de production.
