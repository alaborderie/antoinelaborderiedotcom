// Replays the TLC paths of AssetRollout.tla on two real builds of this checkout, one step per TLA+ action.
// Usage (from check.sh): V1=<asset version 1> V2=<asset version 2> node replay.mjs <pod A port> <pod B port> <proxy port>
// Env: PW_CORE (playwright-core package dir), CHROME (Chromium binary).
// Pod A = release 1 (styles.css marked --release: "1"), pod B = release 2 (ASSET_VERSION bumped, marked "2").
// A small proxy stands in for Traefik; Chromium's own HTTP cache is the browser cache.
// Chromium reaches 127.0.0.1 only: every other host fails to resolve (PostHog included).
import http from "node:http";
const { chromium } = await import(`${process.env.PW_CORE}/index.mjs`);

const [A, B, PROXY] = process.argv.slice(2, 5).map(Number);
const name = { [A]: "pod A (release 1)", [B]: "pod B (release 2)" };
let live = [A];
const plan = [];
const log = [];
const kindOf = (url) => (url.startsWith("/static/styles.css") ? "css" : url === "/" ? "html" : "other");
const proxy = http.createServer((req, res) => {
  const kind = kindOf(req.url);
  const i = plan.findIndex((p) => p.kind === kind);
  const port = i >= 0 ? plan.splice(i, 1)[0].port : live[0];
  if (!live.includes(port)) throw new Error(`plan picked ${port}, not live`);
  const up = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, (r) => {
    if (kind !== "other") log.push(`${req.method} ${req.url} -> ${name[port]}: ${r.statusCode}, cache-control: ${r.headers["cache-control"]}`);
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  req.pipe(up);
});
await new Promise((ok) => proxy.listen(PROXY, "127.0.0.1", ok));
const url = `http://127.0.0.1:${PROXY}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
});
// A passive listener, not context.route(): routing turns off Chromium's HTTP cache, which A1 depends on.
const offsite = new Set(), answered = new Set();
const newContext = async () => {
  const ctx = await browser.newContext();
  const host = (r) => { const u = new URL(r.url()); return u.protocol.startsWith("http") && u.hostname !== "127.0.0.1" ? u.host : null; };
  ctx.on("request", (r) => host(r) && offsite.add(host(r)));
  ctx.on("response", (r) => host(r.request()) && answered.add(host(r.request())));
  return ctx;
};
const look = (page) => page.evaluate(() => ({
  pageLinks: document.querySelector("link[rel=stylesheet]")?.getAttribute("href") ?? "inline",
  jsRelease: window.__assetRelease,
  cssRelease: getComputedStyle(document.documentElement).getPropertyValue("--release").trim() || "none (no stylesheet applied)",
}));
const show = (s) => { console.log("   page:", JSON.stringify(s)); const l = log.splice(0); l.forEach((x) => console.log("   http:", x)); return l; };

console.log("== A1 (deploy-as-is.cfg): NewLinkNeverHoldsOldCss and PageMatchesItsCss");
let a1 = true;
{
  const ctx = await newContext();
  console.log("0. old release live"); live = [A];
  console.log("1. the new pod starts taking traffic"); live = [A, B];
  console.log("2. you open the home page   [Traefik picks pod B]"); plan.push({ kind: "html", port: B });
  console.log("3. the CSS request reaches the other release   [Traefik picks pod A]"); plan.push({ kind: "css", port: A });
  const p1 = await ctx.newPage(); await p1.goto(url, { waitUntil: "load" });
  const s1 = await look(p1); const l1 = show(s1);
  if (s1.cssRelease !== '\"2\"' || s1.jsRelease !== "2" || l1.some(x => x.includes("styles.css")))
    throw new Error("A1: new HTML must carry release-2 CSS and JS without an asset fetch");
  plan.length = 0;
  a1 &&= s1.pageLinks.endsWith(`?v=${process.env.V2}`) && s1.cssRelease === '"1"';
  console.log(`   new page (?v=new) styled with release-1 CSS: ${a1}`);
  console.log("4. the old pod stops taking traffic"); live = [B];
  console.log("5. you open the home page again (new tab, same browser)");
  const p2 = await ctx.newPage(); await p2.goto(url, { waitUntil: "load" });
  const s2 = await look(p2); const l2 = show(s2);
  if (l2.some(x => x.startsWith("GET / ->"))) throw new Error("A1: second tab did not reuse cached HTML");
  if (s2.cssRelease !== '\"2\"' || s2.jsRelease !== "2") throw new Error("A1: cached HTML lost its own assets");
  const reused = s2.cssRelease === '"1"' && !l2.some((x) => x.includes("styles.css"));
  console.log(`   only release 2 live, the browser reuses the release-1 CSS kept under ?v=new (no CSS request reached a pod): ${reused}`);
  a1 &&= reused;
  await ctx.close();
}
console.log("A1 FIXED on the real builds (matching CSS and JS, including cached HTML)");

console.log("== A2 (cutover.cfg): PageMatchesItsCss with an instant switch");
let a2;
{
  const ctx = await newContext();
  console.log("0. old release live"); live = [A, B]; // both reachable so the scripted plan can order the switch
  console.log("1. you open the home page   [pod A answers]"); plan.push({ kind: "html", port: A });
  console.log("2. traffic switches to the new pod");
  console.log("3. the CSS request reaches the other release   [pod B answers]"); plan.push({ kind: "css", port: B });
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "load" });
  const s = await look(p); const lines = show(s);
  if (s.cssRelease !== '\"1\"' || s.jsRelease !== "1" || lines.some(x => x.includes("styles.css")))
    throw new Error("A2: old HTML must retain release-1 CSS and JS across cutover");
  plan.length = 0;
  a2 = s.pageLinks.endsWith(`?v=${process.env.V1}`) && s.cssRelease === '"2"';
  console.log(`   old page (?v=old) styled with release-2 CSS: ${a2}`);
  await ctx.close();
}
console.log("A2 FIXED on the real builds (old HTML retains its CSS and JS)");
console.log(`off-site hosts the page tried: ${[...offsite].sort().join(", ") || "none"}; answered: ${[...answered].sort().join(", ") || "none"}`);
await browser.close();
proxy.close();
