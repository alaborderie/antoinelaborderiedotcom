# Home page interactions

The home page reacts to the visitor. A capability button highlights the projects that use that capability and dims the others. The `Selected work` index marks the project being read, and the accent color follows the section in view. A meter under the index shows how far through the three projects the visitor is. Project details open in place, and a light follows a fine pointer. Only the details and the jump from an index link work without JavaScript.

## Sub-features

- `capability-filter` highlights related projects for one capability at a time and clears on a second click.
- `selected-work-index` scrolls to a project from its index link, after which that link is the current one and the meter shows its position.
- `scroll-follows-reading` moves the active scene and the current index link in page order while the visitor scrolls.
- `work-details` opens and closes the details of a project.
- `pointer-light` moves the background light to the pointer.
- `no-script-errors` loads and scrolls both locales without an uncaught script error.

## How to get to it (user POV)

- Open `/` or `/fr` in a browser with JavaScript on.
- Choose one of the six buttons in the `Capabilities` section (`#skills`, `Expertises` in French).
- Choose `Peaksys`, `HelloWork` or `Royal Canin` in the index beside `Selected work` (`#projects`, `Réalisations choisies` in French).
- Scroll the page with the wheel, the keyboard or touch.
- Choose `Explore the system` or `View practices and stack` under a project (`Explorer le système` or `Voir les pratiques et la stack` in French).
- Move a mouse over the page.

## Driving it with verify.mjs

Preconditions:

- `$V doctor` reports `healthy`.
- The browser is the full Chromium build at 1280x800 without reduced motion.

- **Filter by capability.** Choose `button[data-capability="platform"]`, then `cloud`, then `cloud` again. Run `$V drive interactions`, check `capability-filter`. After the first click only that button has `aria-pressed="true"`, every `[data-capabilities]` item that lists `platform` has the class `is-related`, and every other item has `is-dimmed`. After the second click only `cloud` is pressed. After the third no button is pressed and no item is related or dimmed.
- **Jump from the index.** On a fresh page, scroll to another project until its link is the current one, then choose `a[data-stage-link="peaksys"]`. Repeat on fresh pages for `hellowork` and `royalcanin`, in both locales. Check `selected-work-index`. When the scroll ends, the chosen link is the only one with `aria-current`, `body[data-active-scene]` is `work`, `#scene-<stage>` is in the upper half of the viewport, and `--stage-progress` on `.stage-meter i` is 33%, 67% or 100% for the first, second or third project.
- **Scroll to the bottom.** Move the pointer over the page and turn the wheel 200 px at a time to the end, in both locales. Check `scroll-follows-reading`. The sequence of active scenes is `signal`, `flow`, `capability`, `work` with the current link going `peaksys`, `hellowork`, `royalcanin`, then `lab`, `timeline`, `contact`, with no step backward.
- **Open project details.** Choose the `summary` of `#scene-peaksys`, then choose it again. Check `work-details`. The `.evidence-grid` becomes visible, then hidden.
- **Move the pointer.** Move the mouse to (321, 234). Check `pointer-light`. `body` has the class `has-pointer`, and `--pointer-x` and `--pointer-y` on `html` become `321px` and `234px`.
- **Watch for errors.** Open each locale and scroll to the bottom. Check `no-script-errors`. The page reports no uncaught error and `html` has the classes `studio-no-js studio-js`.
- **Proof.** `interactions.capability-filter.platform.png`, `interactions.scroll-follows-reading.en-bottom.png`, `interactions.scroll-follows-reading.fr-bottom.png` and `interactions.work-details.open.png`, with the `interactions/` blocks of `run.log`.

## Gotchas

- Chromium 156.0.8078.4 can crash the page when a second index link is clicked on the same page after the first smooth scroll. Chromium 158.0.8127.18 and Firefox 157 do not. `selected-work-index` uses a fresh page per link. Do not chain index clicks on one page with that build.
- The Peaksys link is already the current one when the page loads, and the scroll sets the current link, not the click. Start from another project, or a check on Peaksys proves nothing.
- The index link becomes current while the page is still scrolling. Wait for the scroll to end before you read a position.
- The highlight depends on the viewport height. The scene sequence above is for 1280x800. The `verify-scroll-highlight` skill model-checks the rule for every scroll position, and this map only proves the visitor's path.
- The pointer light is off for a coarse pointer and for reduced motion. `has-pointer` is then absent by design.
- With JavaScript off, project details still open and index links still jump, because both are plain HTML. The filter, the current link, the meter, the scene color and the pointer light do not exist. `home/home-without-javascript` covers that page.
