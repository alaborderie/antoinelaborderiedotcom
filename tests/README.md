Run the browser regression suite from the repository root.

```sh
npm ci
npx playwright-core install --with-deps chromium-headless-shell
npm test
```

Set `CHROME=/path/to/chrome-headless-shell` to use an existing browser. Node 22 or later is required. CI runs `npm test` on pull requests and main, before deployment.

The tests load the actual English and French content templates, stylesheet and `static/main.js` in Chromium. All network requests are blocked. They replay C1, C2 and C3 and cross each section's exit in both directions. The replay paths assert band membership and scroll direction; the exit sweep asserts band membership across jumps. Positions come from the page geometry rather than fixed scroll offsets.

The active target remains selected while it is in the observer's reading band. On leaving, it hands over to the first target in document order still in the band. When the band is empty, the previous highlight is retained until a target enters.
