// Reader: Antoine, deciding whether a release can leave visitors with a broken-looking page.
const key2 = (v) => (Object.keys(v.cssCache).includes("2") ? "2" : "1");
const site = (v) => {
  const live = [...v.live].sort().join(",");
  return live === "1" ? "Old release live" : live === "2" ? "New release live" : "Old and new pod both live";
};
const pageLabel = (v) => {
  if (v.page === 0) return "No page yet";
  if (v.styled === 0) return "Page waiting for its CSS";
  if (v.styled === 3) return "Page without CSS";
  return v.styled === v.page
    ? (v.page === 1 ? "Old page, looks right" : "New page, looks right")
    : (v.page === 1 ? "Old page with new CSS" : "New page with old CSS");
};
const stored = (v) => {
  const c = v.cssCache[key2(v)];
  return c === 0 ? "nothing kept for the new CSS link" : c === 2 ? "new CSS kept for the new link" : "old CSS kept under the new link";
};
const mixed = (v) => v.styled === 1 || v.styled === 2 ? v.styled !== v.page : false;
const poisoned = (v) => v.cssCache[key2(v)] === 1 && v.live.includes(2);
export const state = (v) => {
  const s = site(v);
  const p = mixed(v) ? "page shown with the other release's CSS" : v.styled === 3 ? "page shown without CSS" : "page looks right";
  return poisoned(v) ? `${s}: ${p}; old CSS kept under the new link` : `${s}: ${p}`;
};
export const group = (v) => (mixed(v) || poisoned(v) ? "broken" : "fine");
export const colors = { fine: "teal", broken: "pink" };
export const title = "One visitor during a release of antoinelaborderie.com";
export const step = (action, from, to) => {
  switch (action) {
    case "NewPodReady": return "the new pod starts taking traffic";
    case "OldPodRemoved": return "the old pod stops taking traffic";
    case "InstantSwitch": return "traffic switches to the new pod";
    case "YouOpenPageFromCache":
    case "YouOpenPageFromServer": return "you open the home page";
    case "CssFromCache": return "the CSS comes from your browser cache";
    case "CssFromServer":
      if (to.styled === 3) return "the CSS request fails";
      return to.styled === to.page ? "the CSS arrives" : "the CSS request reaches the other release";
    case "PageExpires": return null;
    case "CssExpires": return "a day passes and the kept CSS expires";
  }
  return action;
};
