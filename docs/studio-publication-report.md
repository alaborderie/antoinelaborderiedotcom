# Publication du portfolio studio

## Migration

- Le design studio devient l’unique portfolio public sur `/` en anglais et `/fr` en français.
- La grande typographie éditoriale, les scènes d’expérience, la lentille d’expertise et les interactions progressives sont conservées.
- Les anciennes variantes `/concept` et `/concept-spatial` redirigent directement vers la langue publique correspondante.
- Les gabarits, styles, scripts et rapports propres aux prototypes ont été supprimés, ainsi que l’ancien pipeline Tailwind devenu inutilisé.

## Contenu et référencement

- Les titres, descriptions, canoniques, hreflang, Open Graph, Twitter et données structurées Person/WebSite/ProfilePage restent localisés.
- Le portrait référencé par les données structurées et le favicon sont conservés. L’image sociale 1200 × 630 adopte l’identité visuelle studio tout en gardant le nom, le rôle et les expertises vérifiés.
- Les ancres publiques `#about`, `#skills`, `#projects`, `#experience` et `#contact` restent disponibles.
- Les expertises visibles couvrent notamment Backstage, Kubernetes, Azure, AWS, Redis, Grafana, Go, Prompt Engineering, intégration LLM et MCP sans les rattacher artificiellement à une mission.

## Vérification

- Les routes publiques doivent rester indexables ; le sitemap ne contient que `/` et `/fr`.
- Les contrôles finaux couvrent les redirections historiques, les métadonnées, les assets, les réponses 404, le clavier, le mode sans JavaScript et la réduction des animations.
- Les mesures Lighthouse sont réalisées sur un serveur local de production et ne garantissent pas les performances après déploiement.
