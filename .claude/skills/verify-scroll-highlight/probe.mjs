// verify-scroll-highlight probe. Usage (from check.sh): node probe.mjs <site url> <ScrollTracking.tla>
// Env: PW_CORE = playwright-core package dir, CHROME = Chromium/headless-shell binary.
// 1. Wraps IntersectionObserver before static/main.js runs, scrolls the home page in 8 px steps and
//    records the zones (each target out/low/high) that main.js's two observers really go through.
// 2. Compares the observer options and zone sequences with the tables in ScrollTracking.tla.
// 3. Replays each known TLC bug path (C1 to C3) on the real page, one scroll per step, scrolling to the
//    middle of each zone.
// Prints one line per result: "ZONES <kind> OK ...", "MISMATCH ...", "<id> REPRODUCED|NOT REPRODUCED|NOT RUN ...".
// Chromium reaches 127.0.0.1 only: every other host fails to resolve (PostHog included).
import { readFileSync } from "node:fs";
const [url, specPath] = process.argv.slice(2);
const { chromium } = await import(`${process.env.PW_CORE}/index.mjs`);
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
});
const offsite = new Set(), answered = new Set();
const newPage = async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const host = (r) => { const u = new URL(r.url()); return u.protocol.startsWith("http") && u.hostname !== "127.0.0.1" ? u.host : null; };
  p.on("request", (r) => host(r) && offsite.add(host(r)));
  p.on("response", (r) => host(r.request()) && answered.add(host(r.request())));
  return p;
};

const spec = readFileSync(specPath, "utf8");
const table = (name) => {
  const body = spec.split(`${name} == <<`)[1].split(">>")[0];
  return [...body.matchAll(/\[([^\]]*)\]/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/(\w+) \|-> "(\w+)"/g)].map((x) => [x[1], x[2]])));
};
const expected = { stage: table("StageZones"), scene: table("SceneZones") };
const expectedOptions = { scene: { rootMargin: "-30% 0px -45%", threshold: [0, 0.25, 0.5] }, stage: { rootMargin: "-18% 0px -45%", threshold: [0, 0.2, 0.5] } };

const page = await newPage();
await page.addInitScript(() => {
  const Original = window.IntersectionObserver;
  window.__observers = [];
  window.IntersectionObserver = class extends Original {
    constructor(callback, options) {
      const rec = { options, state: {}, kind: null };
      window.__observers.push(rec);
      const mid = [].concat(options.threshold)[1];
      super((entries, obs) => {
        for (const e of entries) {
          const d = e.target.dataset;
          rec.kind = d.stage ? "stage" : "scene";
          if (!rec.kind || (rec.kind === "scene" && !["capability", "work", "lab"].includes(d.scene))) continue;
          rec.state[d.stage ?? d.scene] = !e.isIntersecting ? "out" : e.intersectionRatio >= mid ? "high" : "low";
        }
        callback(entries, obs);
      }, options);
    }
  };
});
await page.goto(url, { waitUntil: "load" });
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
const seq = { stage: [], scene: [] };
const options = {};
const top = await page.evaluate(() => document.querySelector("[data-scene=capability]").getBoundingClientRect().top + scrollY);
// Stop with the scene band (30%..55% of the viewport) on the middle of the lab section: the scene model
// is a window of three scenes and does not include the timeline section after it.
const end = await page.evaluate(() => { const r = document.querySelector("[data-scene=lab]").getBoundingClientRect(); return r.top + scrollY + r.height / 2 - 0.425 * innerHeight; });
for (let y = Math.max(0, Math.floor(top) - 400); y <= end; y += 8) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await frames();
  const obs = await page.evaluate(() => window.__observers.map((o) => ({ kind: o.kind, options: o.options, state: { ...o.state } })));
  for (const o of obs) {
    if (!o.kind) continue;
    options[o.kind] = o.options;
    const z = JSON.stringify(o.state);
    if (seq[o.kind].at(-1)?.z !== z) seq[o.kind].push({ y, z, zone: o.state });
  }
}
await page.close();
const zonesOk = {};
for (const kind of ["stage", "scene"]) {
  zonesOk[kind] = true;
  if (JSON.stringify(options[kind]) !== JSON.stringify(expectedOptions[kind])) {
    zonesOk[kind] = false;
    console.log(`MISMATCH ${kind} observer options ${JSON.stringify(options[kind])} != model ${JSON.stringify(expectedOptions[kind])}`);
  }
  const keys = Object.keys(seq[kind][0]?.zone ?? {});
  const got = seq[kind].map((s) => JSON.stringify(s.zone));
  const want = expected[kind].map((z) => JSON.stringify(Object.fromEntries(keys.map((k) => [k, z[k]]))));
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    zonesOk[kind] = false;
    console.log(`MISMATCH ${kind} zones: page goes through\n  ${got.join("\n  ")}\nmodel says\n  ${want.join("\n  ")}`);
  } else console.log(`ZONES ${kind} OK: the page goes through the model's ${want.length} zones in order`);
}

const mid = (kind, k) => { const s = seq[kind]; return Math.round((s[k - 1].y + (s[k]?.y ?? s[k - 1].y + 16)) / 2); };
const read = (p, kind) => p.evaluate((kind) => kind === "stage"
  ? document.querySelector("[data-stage-link][aria-current=location]")?.dataset.stageLink ?? "none"
  : document.body.dataset.activeScene ?? "none", kind);
async function replay(id, name, kind, zones, check) {
  if (!zonesOk[kind]) { console.log(`${id} NOT RUN ${name}: the ${kind} zones no longer match the model`); return; }
  const p = await newPage();
  await p.goto(url, { waitUntil: "load" });
  const lit = [];
  for (const z of zones) { await p.evaluate((y) => window.scrollTo(0, y), mid(kind, z)); await p.waitForTimeout(300); lit.push(await read(p, kind)); }
  console.log(`${id} ${check(lit) ? "REPRODUCED" : "NOT REPRODUCED"} ${name}: zones ${zones.join(" -> ")}, highlight ${lit.join(" -> ")}`);
  await p.close();
}
await replay("C1", "stage/HighlightNeverGoesBack", "stage", [3, 4, 5], (l) => l.join() === "peaksys,hellowork,peaksys");
await replay("C2", "stage/HighlightIsOnScreen", "stage", [3, 4, 3], (l) => l[2] === "hellowork");
await replay("C3", "scene/HighlightIsOnScreen", "scene", [1, 2, 1], (l) => l[2] === "work");
await browser.close();
console.log(`off-site hosts the page tried: ${[...offsite].sort().join(", ") || "none"}; answered: ${[...answered].sort().join(", ") || "none"}`);
