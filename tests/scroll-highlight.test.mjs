import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

for (const locale of ["en", "fr"]) {
  test(`${locale}: scroll highlights stay in the band and follow scroll direction`, async (t) => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.route("**/*", (route) => route.abort());
      const content = await readFile(new URL(`../templates/content/${locale}.html`, import.meta.url), "utf8");
      const css = await readFile(new URL("../static/styles.css", import.meta.url), "utf8");
      await page.setContent(`<!doctype html><html class="studio-js"><head><style>${css}</style></head><body>${content}</body></html>`);
      await page.addScriptTag({ path: "static/main.js" });
      const move = async (y) => {
        await page.evaluate((y) => scrollTo(0, y), y);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))));
      };
      const positions = await page.evaluate(() => {
        const rect = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top + scrollY, bottom: r.bottom + scrollY, height: r.height };
        };
        const a = rect('[data-stage="peaksys"]');
        const b = rect('[data-stage="hellowork"]');
        const enters = b.top - innerHeight * .55;
        const drops = a.bottom - innerHeight * .18 - .2 * a.height;
        const scene = rect('[data-scene="work"]');
        return { stage: [enters - 150, (enters + drops) / 2, drops + 20], scene: [scene.top - innerHeight * .55 - 40, scene.top - innerHeight * .55 + 40] };
      });
      const check = async (kind) => page.evaluate((kind) => {
        const stage = kind === "stage";
        const key = stage ? "stage" : "scene";
        const targets = [...document.querySelectorAll(`[data-${key}]`)];
        const lit = stage ? document.querySelector('[data-stage-link][aria-current="location"]')?.dataset.stageLink : document.body.dataset.activeScene;
        const band = targets.filter((target) => {
          const r = target.getBoundingClientRect();
          return r.bottom >= innerHeight * (stage ? .18 : .30) && r.top <= innerHeight * .55;
        }).map((target) => target.dataset[key]);
        return { lit, band, index: targets.findIndex((target) => target.dataset[key] === lit) };
      }, kind);
      for (const [id, kind, path] of [
        ["C1", "stage", positions.stage],
        ["C2", "stage", [positions.stage[0], positions.stage[1], positions.stage[0]]],
        ["C3", "scene", [positions.scene[0], positions.scene[1], positions.scene[0]]],
      ]) {
        await t.test(id, async () => {
        let previous;
        for (const y of path) {
          await move(y);
          const state = await check(kind);
          assert.ok(state.band.includes(state.lit), `${id}: ${state.lit} outside band ${state.band}`);
          if (previous) {
            assert.ok(y > previous.y ? state.index >= previous.index : state.index <= previous.index, `${id}: highlight moved against scroll direction`);
          }
          previous = { y, index: state.index };
        }
        });
      }
      // Also cross the exits, where a sticky highlight must hand over to another target.
      for (const kind of ["stage", "scene"]) {
        const points = await page.locator(`[data-${kind}]`).evaluateAll((targets) => targets.map((target) => target.getBoundingClientRect().top + scrollY - innerHeight * .35));
        for (const y of [...points, ...points.toReversed()]) {
          await move(y);
          const state = await check(kind);
          if (state.band.length) assert.ok(state.band.includes(state.lit), `${kind}: ${state.lit} outside band ${state.band}`);
        }
      }
    } finally {
      await browser.close();
    }
  });
}
