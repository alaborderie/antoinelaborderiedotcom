// Reader: Antoine, deciding whether the "you are here" highlight follows the visitor's reading.
// Labels come from the zone tables of ScrollTracking.tla next to this file, so they stay right when the
// tables change. Set SCROLL_OBSERVER to the config's Observer value: stage, stage2 or scene.
import { readFileSync } from "node:fs";
const observer = process.env.SCROLL_OBSERVER;
const tableName = { stage: "StageZones", stage2: "Stage2Zones", scene: "SceneZones" }[observer];
if (!tableName) throw new Error("set SCROLL_OBSERVER to stage, stage2 or scene");
const spec = readFileSync(new URL("./ScrollTracking.tla", import.meta.url), "utf8");
const zones = [...spec.split(`${tableName} == <<`)[1].split(">>")[0].matchAll(/\[([^\]]*)\]/g)].map((m) =>
  Object.fromEntries([...m[1].matchAll(/(\w+) \|-> "(\w+)"/g)].map((x) => [x[1], x[2]])));
const nice = { peaksys: "Peaksys", hellowork: "HelloWork", royalcanin: "Royal Canin", capability: "Expertise", work: "Selected work", lab: "Project lab", none: "nothing" };
const where = (z) => {
  const high = Object.keys(z).filter((k) => z[k] === "high").map((k) => nice[k]);
  const low = Object.keys(z).filter((k) => z[k] === "low").map((k) => nice[k]);
  if (!high.length && !low.length) return observer === "scene" ? "no section in view" : "no stage in view";
  const parts = [];
  if (high.length) parts.push(`reading ${high.join(" and ")}`);
  if (low.length) parts.push(`${low.join(" and ")} at the edge${low.length > 1 ? "s" : ""}`);
  return parts.join(", ");
};
const band = (z) => Object.keys(z).filter((k) => z[k] !== "out");
export const state = (v) => `${where(zones[v.zone - 1])}; highlight on ${nice[v.lit]}`;
export const group = (v) => { const b = band(zones[v.zone - 1]); return b.length && !b.includes(v.lit) ? "wrong" : "right"; };
export const colors = { right: "teal", wrong: "pink" };
export const title = "The 'you are here' highlight while you scroll";
export const step = (action) => ({ YouScrollDown: "you scroll down", YouScrollUp: "you scroll up" })[action] ?? action;
