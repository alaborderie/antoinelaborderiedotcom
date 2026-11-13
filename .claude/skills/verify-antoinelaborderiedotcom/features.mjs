import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const PROD = "https://antoinelaborderie.com";

const LOCALES = {
  en: { home: "/", legal: "/legal-notice", nav: "Primary navigation", switchTo: "FR", legalLink: "Legal notice", homeLink: "Home", backHome: "Back to home", ogLocale: "en_GB" },
  fr: { home: "/fr", legal: "/fr/mentions-legales", nav: "Navigation principale", switchTo: "EN", legalLink: "Mentions légales", homeLink: "Accueil", backHome: "Retour à l’accueil", ogLocale: "fr_FR" },
};
const HOME_ALTERNATES = { en: `${PROD}/`, fr: `${PROD}/fr`, "x-default": `${PROD}/` };
const LEGAL_ALTERNATES = { en: `${PROD}/legal-notice`, fr: `${PROD}/fr/mentions-legales`, "x-default": `${PROD}/legal-notice` };

const OLD_LINKS = [
  ["/en", "/"],
  ["/en/", "/"],
  ["/fr/", "/fr"],
  ["/legal-notice/", "/legal-notice"],
  ["/fr/mentions-legales/", "/fr/mentions-legales"],
  ["/concept", "/"],
  ["/concept/", "/"],
  ["/concept/fr", "/fr"],
  ["/concept/fr/", "/fr"],
  ["/concept-spatial", "/"],
  ["/concept-spatial/", "/"],
  ["/concept-spatial/fr", "/fr"],
  ["/concept-spatial/fr/", "/fr"],
];

const HTML_CACHE = "public, max-age=300";
const ASSET_CACHE = "public, max-age=86400";
const HSTS = "max-age=31536000";

const eachLocale = async (run) => {
  for (const [lang, locale] of Object.entries(LOCALES)) await run(lang, locale);
};
const pathOf = (page) => new URL(page.url()).pathname;
const attribute = (page, selector, name) => page.locator(selector).first().getAttribute(name);

async function alternates(page) {
  return Object.fromEntries(await page.locator('link[rel="alternate"][hreflang]').evaluateAll((links) => links.map((link) => [link.hreflang, link.href])));
}

async function indexablePage(t, route, lang, canonical, expectedAlternates) {
  const page = await t.page();
  const response = await page.open(route);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["cache-control"], HTML_CACHE);
  assert.equal(await attribute(page, "html", "lang"), lang);
  assert.equal(await page.locator("h1").count(), 1, "exactly one h1");
  assert.ok((await page.title()).length > 10, "a title");
  assert.ok((await attribute(page, 'meta[name="description"]', "content")).length > 40, "a meta description");
  assert.equal(await attribute(page, 'link[rel="canonical"]', "href"), canonical);
  assert.deepEqual(await alternates(page), expectedAlternates);
  assert.equal(await page.locator('meta[name="robots"]').count(), 0, "no robots meta: the page is indexable");
  return page;
}

async function scrollSettled(t, page) {
  let last = -1;
  await t.until(async () => {
    const now = await page.evaluate(() => window.scrollY);
    const still = now === last;
    last = now;
    return still;
  }, "the smooth scroll to end");
}

async function sdkLoaded(t, page) {
  await t.until(() => page.evaluate(() => window.posthog?.__loaded === true), "the PostHog SDK to load from eu-assets.i.posthog.com", 20000);
}

const home = {
  id: "home",
  checks: [
    {
      id: "home-page",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await indexablePage(t, locale.home, lang, HOME_ALTERNATES[lang], HOME_ALTERNATES);
          for (const id of ["services", "about", "skills", "projects", "experience", "contact"]) {
            assert.equal(await page.locator(`#${id}`).count(), 1, `section #${id}`);
          }
          await t.shot(page, lang);
        });
      },
    },
    {
      id: "home-nav",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          const nav = page.getByRole("navigation", { name: locale.nav });
          for (const hash of ["#services", "#skills", "#projects", "#contact"]) {
            await nav.locator(`a[href="${hash}"]`).click();
            const top = await t.until(async () => {
              const box = await page.locator(hash).boundingBox();
              return box.y > -5 && box.y < 400 ? { y: Math.round(box.y) } : null;
            }, `${hash} to scroll to the top of the viewport`);
            t.note(`${lang}: nav link ${hash} -> section top at ${top.y}px`);
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await scrollSettled(t, page);
          await page.locator('header a.button-secondary[href="#services"]').click();
          await t.until(async () => (await page.locator("#services").boundingBox()).y < 400, "the hero link to scroll to #services");
          t.note(`${lang}: hero link to #services scrolls to the section`);
        });
      },
    },
    {
      id: "home-services",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          const visible = await page.locator("#services article h3").allTextContents();
          const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
          const structured = data["@graph"].filter((item) => item["@type"] === "Service").map((item) => item.name);
          assert.equal(visible.length, 5, "five service cards");
          assert.deepEqual([...structured].sort(), [...visible].sort(), "JSON-LD services match the visible cards");
          t.note(`${lang}: ${visible.join(" | ")}`);
        });
      },
    },
    {
      id: "home-language-switch",
      async run(t) {
        const page = await t.page();
        await page.open("/");
        await page.getByRole("navigation", { name: LOCALES.en.nav }).getByRole("link", { name: "FR", exact: true }).click();
        await page.waitForURL("**/fr");
        assert.equal(await attribute(page, "html", "lang"), "fr");
        t.note(`click FR -> ${pathOf(page)} lang=fr`);
        await page.getByRole("navigation", { name: LOCALES.fr.nav }).getByRole("link", { name: "EN", exact: true }).click();
        await t.until(() => pathOf(page) === "/", "the English home");
        assert.equal(await attribute(page, "html", "lang"), "en");
        t.note(`click EN -> ${pathOf(page)} lang=en`);
      },
    },
    {
      id: "home-contact",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          const mailto = await page.locator('a[href^="mailto:"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
          assert.equal(mailto.length, 3, "nav, hero and closing calls to action");
          assert.equal(new Set(mailto).size, 1, "every call to action opens the same email draft");
          const malt = page.locator('a[href^="https://www.malt.fr/profile/"]');
          assert.equal(await malt.count(), 1, "one Malt profile link");
          assert.equal(await malt.getAttribute("target"), "_blank");
          assert.equal(await page.locator("form, input, textarea").count(), 0, "the site has no form");
          t.note(`${lang}: 3 mailto links with one address and subject, Malt link ${await malt.getAttribute("href")}`);
        });
      },
    },
    {
      id: "home-without-javascript",
      async run(t) {
        const page = await t.page({ js: false });
        await page.open("/");
        const state = await page.evaluate(() => ({
          classes: document.documentElement.className,
          hidden: [...document.querySelectorAll(".reveal, #services article, .work-scene, #contact a")].filter((element) => getComputedStyle(element).opacity !== "1" || getComputedStyle(element).visibility !== "visible").length,
        }));
        assert.equal(state.classes, "studio-no-js");
        assert.equal(state.hidden, 0, "no content waits for JavaScript to appear");
        await page.locator("#scene-peaksys summary").click();
        assert.equal(await page.locator("#scene-peaksys details").getAttribute("open"), "");
        await t.shot(page, "no-js");
      },
    },
    {
      id: "home-social-preview",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          assert.equal(await attribute(page, 'meta[property="og:locale"]', "content"), locale.ogLocale);
          assert.equal(await attribute(page, 'meta[name="twitter:card"]', "content"), "summary_large_image");
          const image = new URL(await attribute(page, 'meta[property="og:image"]', "content"));
          assert.equal(image.origin, PROD);
          assert.equal(await attribute(page, 'meta[name="twitter:image"]', "content"), image.href);
          const res = await t.get(`${image.pathname}${image.search}`);
          assert.equal(res.status, 200);
          assert.equal(res.headers["content-type"], "image/png");
          assert.equal(res.bytes.subarray(1, 4).toString(), "PNG");
        });
      },
    },
  ],
};

const interactions = {
  id: "interactions",
  checks: [
    {
      id: "capability-filter",
      async run(t) {
        const page = await t.page();
        await page.open("/");
        const pressed = () => page.locator('button[data-capability][aria-pressed="true"]').evaluateAll((buttons) => buttons.map((button) => button.dataset.capability));
        const marks = () => page.locator("[data-capabilities]").evaluateAll((items) => items.map((item) => ({
          capabilities: item.dataset.capabilities.split(" "),
          related: item.classList.contains("is-related"),
          dimmed: item.classList.contains("is-dimmed"),
        })));
        assert.equal(await page.locator("button[data-capability]").count(), 6);

        await page.locator('button[data-capability="platform"]').click();
        assert.deepEqual(await pressed(), ["platform"]);
        let items = await marks();
        for (const item of items) {
          assert.equal(item.related, item.capabilities.includes("platform"), `is-related on an item with ${item.capabilities.join(" ")}`);
          assert.equal(item.dimmed, !item.related, `is-dimmed on an item with ${item.capabilities.join(" ")}`);
        }
        t.note(`platform: ${items.filter((item) => item.related).length} related, ${items.filter((item) => item.dimmed).length} dimmed`);
        await t.shot(page, "platform");

        await page.locator('button[data-capability="cloud"]').click();
        assert.deepEqual(await pressed(), ["cloud"]);
        items = await marks();
        assert.ok(items.every((item) => item.related === item.capabilities.includes("cloud")));

        await page.locator('button[data-capability="cloud"]').click();
        assert.deepEqual(await pressed(), []);
        assert.ok((await marks()).every((item) => !item.related && !item.dimmed), "a second click clears the filter");
      },
    },
    {
      id: "selected-work-index",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const current = (page) => page.locator("[data-stage-link][aria-current]").evaluateAll((links) => links.map((link) => link.dataset.stageLink));
          for (const [index, stage] of ["peaksys", "hellowork", "royalcanin"].entries()) {
            const page = await t.page();
            await page.open(locale.home);
            const elsewhere = stage === "peaksys" ? "royalcanin" : "peaksys";
            await page.locator(`#scene-${elsewhere} h2`).scrollIntoViewIfNeeded();
            await t.until(async () => (await current(page)).join() === elsewhere, `the ${elsewhere} link to be current before the click`);
            await scrollSettled(t, page);
            await page.locator(`a[data-stage-link="${stage}"]`).click();
            await t.until(async () => (await current(page)).join() === stage, `the ${stage} link to be the only current one`);
            await scrollSettled(t, page);
            assert.ok(Math.abs((await page.locator(`#scene-${stage}`).boundingBox()).y) < 400, `#scene-${stage} is at the top of the viewport`);
            assert.equal(await page.locator("body").getAttribute("data-active-scene"), "work");
            const progress = await page.locator(".stage-meter i").evaluate((bar) => parseFloat(bar.style.getPropertyValue("--stage-progress")));
            assert.equal(Math.round(progress), Math.round(((index + 1) / 3) * 100), "the stage meter shows the position in the index");
          }
          t.note(`${lang}: from another project, each stage link scrolls to its project, becomes the only current link and moves the meter`);
        });
      },
    },
    {
      id: "scroll-follows-reading",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          await page.mouse.move(640, 400);
          const trail = [];
          const record = async () => {
            const scene = await page.locator("body").getAttribute("data-active-scene");
            const stage = scene === "work" ? `work:${await page.locator("[data-stage-link][aria-current]").getAttribute("data-stage-link")}` : scene;
            if (trail.at(-1) !== stage) trail.push(stage);
          };
          const height = await page.evaluate(() => document.body.scrollHeight);
          for (let y = 0; y < height; y += 200) {
            await page.mouse.wheel(0, 200);
            await page.waitForTimeout(60);
            await record();
          }
          await scrollSettled(t, page);
          await record();
          assert.deepEqual(trail, ["signal", "flow", "capability", "work:peaksys", "work:hellowork", "work:royalcanin", "lab", "timeline", "contact"]);
          t.note(`${lang}: wheel to the bottom -> ${trail.join(" > ")}`);
          await t.shot(page, `${lang}-bottom`);
        });
      },
    },
    {
      id: "work-details",
      async run(t) {
        const page = await t.page();
        await page.open("/");
        const details = page.locator("#scene-peaksys details");
        await details.locator("summary").click();
        await details.locator(".evidence-grid").waitFor({ state: "visible" });
        await t.shot(page, "open");
        await details.locator("summary").click();
        await details.locator(".evidence-grid").waitFor({ state: "hidden" });
      },
    },
    {
      id: "pointer-light",
      async run(t) {
        const page = await t.page();
        await page.open("/");
        assert.ok(await page.evaluate(() => document.body.classList.contains("has-pointer")), "a fine pointer enables the light");
        await page.mouse.move(321, 234);
        await t.until(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--pointer-x") === "321px" && document.documentElement.style.getPropertyValue("--pointer-y") === "234px"), "the light to follow the pointer");
      },
    },
    {
      id: "no-script-errors",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(500);
          assert.deepEqual(page.seen.errors, []);
          assert.equal(await attribute(page, "html", "class"), "studio-no-js studio-js");
        });
      },
    },
  ],
};

const legalNotice = {
  id: "legal-notice",
  checks: [
    {
      id: "legal-page",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await indexablePage(t, locale.legal, lang, `${PROD}${locale.legal}`, LEGAL_ALTERNATES);
          for (const id of ["publisher-title", "host-title", "analytics-title"]) {
            assert.ok(await page.locator(`section[aria-labelledby="${id}"] h2#${id}`).isVisible(), `section ${id}`);
          }
          assert.equal(await page.locator('main a[href^="mailto:"]').count(), 1, "a contact address");
          assert.match(await page.locator('section[aria-labelledby="publisher-title"]').innerText(), /SIRET\s+\d{3} \d{3} \d{3} \d{5}/);
          assert.match(await page.locator('section[aria-labelledby="analytics-title"]').innerText(), /PostHog Cloud EU/);
          await t.shot(page, lang);
        });
      },
    },
    {
      id: "legal-navigation",
      async run(t) {
        const page = await t.page();
        await page.open("/");
        const footer = page.getByRole("contentinfo");
        await footer.getByRole("link", { name: LOCALES.en.legalLink }).click();
        await t.until(() => pathOf(page) === "/legal-notice", "the English legal notice");
        await page.getByRole("navigation", { name: LOCALES.en.nav }).getByRole("link", { name: "FR", exact: true }).click();
        await t.until(() => pathOf(page) === "/fr/mentions-legales", "the French legal notice");
        await footer.getByRole("link", { name: LOCALES.fr.homeLink }).click();
        await t.until(() => pathOf(page) === "/fr", "the French home");
        await footer.getByRole("link", { name: LOCALES.fr.legalLink }).click();
        await t.until(() => pathOf(page) === "/fr/mentions-legales", "the French legal notice from the French home");
        await page.getByRole("navigation", { name: LOCALES.fr.nav }).getByRole("link", { name: "EN", exact: true }).click();
        await t.until(() => pathOf(page) === "/legal-notice", "the English legal notice");
        await page.getByRole("navigation", { name: LOCALES.en.nav }).locator("a.concept-mark").click();
        await t.until(() => pathOf(page) === "/", "the English home from the AL/26 mark");
        t.note("/ -> /legal-notice -> /fr/mentions-legales -> /fr -> /fr/mentions-legales -> /legal-notice -> /");
      },
    },
  ],
};

const redirects = {
  id: "redirects",
  checks: [
    {
      id: "old-links",
      async run(t) {
        for (const [from, to] of OLD_LINKS) {
          const res = await t.get(from);
          assert.equal(res.status, 308, from);
          assert.equal(res.headers.location, to, from);
        }
      },
    },
    {
      id: "query-kept",
      async run(t) {
        const query = "?utm_source=newsletter&tag=a%2Fb";
        for (const [from, to] of OLD_LINKS) {
          const res = await t.get(`${from}${query}`);
          assert.equal(res.headers.location, `${to}${query}`, from);
        }
      },
    },
    {
      id: "www-to-apex",
      async run(t) {
        const res = await t.www("/fr?source=www&lang=fr");
        assert.equal(res.status, 301);
        assert.equal(res.headers.location, `${PROD}/fr?source=www&lang=fr`);
      },
    },
    {
      id: "browser-lands",
      async run(t) {
        const page = await t.page();
        const response = await page.open("/concept-spatial/fr/?utm_source=old-card");
        assert.equal(response.status(), 200);
        assert.equal(`${pathOf(page)}${new URL(page.url()).search}`, "/fr?utm_source=old-card");
        assert.equal(await attribute(page, "html", "lang"), "fr");
      },
    },
  ],
};

const notFound = {
  id: "not-found",
  checks: [
    {
      id: "not-found-page",
      async run(t) {
        for (const [route, lang, locale] of [["/missing", "en", LOCALES.en], ["/fr/missing", "fr", LOCALES.fr]]) {
          const page = await t.page();
          const response = await page.open(route);
          assert.equal(response.status(), 404);
          assert.equal(response.headers()["cache-control"], "no-store");
          assert.equal(await attribute(page, "html", "lang"), lang);
          assert.equal(await attribute(page, 'meta[name="robots"]', "content"), "noindex");
          const text = await page.locator("main").innerText();
          assert.match(text, /Page not found/i);
          assert.match(text, /Page introuvable/i);
          await t.shot(page, lang);
          await page.getByRole("link", { name: locale.backHome }).click();
          await t.until(() => pathOf(page) === locale.home, `the ${lang} home`);
          t.note(`${route}: 404 in ${lang}, "${locale.backHome}" -> ${locale.home}`);
        }
      },
    },
    {
      id: "not-found-other-language",
      async run(t) {
        for (const [route, link, destination] of [["/missing", "Accueil en français", "/fr"], ["/fr/missing", "Home in English", "/"]]) {
          const page = await t.page();
          await page.open(route);
          await page.locator("main").getByRole("link", { name: link }).click();
          await t.until(() => pathOf(page) === destination, `${destination} after "${link}"`);
          t.note(`${route}: "${link}" -> ${destination}`);
        }
      },
    },
    {
      id: "not-found-static",
      async run(t) {
        for (const [route, lang] of [["/static/missing.css", "en"], ["/static/fr/missing.css", "fr"]]) {
          const res = await t.get(route);
          assert.equal(res.status, 404);
          assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
          assert.equal(res.headers["cache-control"], "no-store");
          assert.ok(res.text.includes(`<html lang="${lang}"`), `${route} in ${lang}`);
        }
      },
    },
  ],
};

const crawlersAndAssets = {
  id: "crawlers-and-assets",
  checks: [
    {
      id: "robots",
      async run(t) {
        const res = await t.get("/robots.txt");
        assert.equal(res.status, 200);
        assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
        assert.equal(res.text, `User-agent: *\nAllow: /\nSitemap: ${PROD}/sitemap.xml\n`);
      },
    },
    {
      id: "sitemap",
      async run(t) {
        const res = await t.get("/sitemap.xml");
        assert.equal(res.status, 200);
        assert.equal(res.headers["content-type"], "application/xml; charset=utf-8");
        const entries = res.text.split("<url>").slice(1);
        assert.equal(entries.length, 4);
        for (const entry of entries) {
          const loc = entry.match(/<loc>(.*?)<\/loc>/)[1];
          assert.ok(loc.startsWith(PROD), loc);
          assert.match(entry, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
          assert.equal(entry.match(/hreflang="(en|fr|x-default)"/g).length, 3, `${loc} alternates`);
          const page = await t.get(loc.slice(PROD.length) || "/");
          assert.equal(page.status, 200, `${loc} is a real page`);
          assert.ok(page.text.includes(`rel="canonical" href="${loc}"`), `${loc} is its own canonical`);
        }
      },
    },
    {
      id: "favicon",
      async run(t) {
        const res = await t.get("/favicon.ico");
        assert.equal(res.status, 200);
        assert.equal(res.headers["content-type"], "image/svg+xml");
        assert.ok(res.text.startsWith("<svg"));
      },
    },
    {
      id: "static-files",
      async run(t) {
        const dir = path.join(t.root, "static");
        for (const name of fs.readdirSync(dir)) {
          const res = await t.get(`/static/${name}`);
          assert.equal(res.status, 200, name);
          assert.equal(res.headers["cache-control"], ASSET_CACHE, name);
          if (t.target !== "prod") assert.ok(res.bytes.equals(fs.readFileSync(path.join(dir, name))), `${name} has the bytes of this checkout`);
        }
        if (t.target === "prod") t.note("byte equality with origin/main is checked by build-and-deploy/live-release");
      },
    },
    {
      id: "compression",
      async run(t) {
        for (const route of ["/", "/static/styles.css"]) {
          for (const encoding of ["br", "gzip"]) {
            const res = await t.get(route, { "accept-encoding": encoding });
            assert.equal(res.headers["content-encoding"], encoding, `${route} ${encoding}`);
            assert.match(res.headers.vary, /accept-encoding/i);
          }
        }
      },
    },
    {
      id: "transport-and-cache-policy",
      async run(t) {
        for (const [route, cache] of [["/", HTML_CACHE], ["/fr", HTML_CACHE], ["/legal-notice", HTML_CACHE], ["/fr/mentions-legales", HTML_CACHE], ["/robots.txt", HTML_CACHE], ["/en", HTML_CACHE], ["/static/styles.css", ASSET_CACHE], ["/missing", "no-store"]]) {
          const res = await t.get(route);
          assert.equal(res.headers["strict-transport-security"], HSTS, route);
          assert.equal(res.headers["cache-control"], cache, route);
        }
      },
    },
  ],
};

const analytics = {
  id: "analytics",
  checks: [
    {
      id: "analytics-on-home",
      async run(t) {
        await eachLocale(async (lang, locale) => {
          const page = await t.page();
          await page.open(locale.home);
          await sdkLoaded(t, page);
          const config = await page.evaluate(() => {
            const { api_host, defaults, cookieless_mode, person_profiles, autocapture, capture_heatmaps, capture_dead_clicks, capture_performance, capture_exceptions, disable_session_recording, disable_surveys } = window.posthog.config;
            return { api_host, defaults, cookieless_mode, person_profiles, autocapture, capture_heatmaps, capture_dead_clicks, capture_performance, capture_exceptions, disable_session_recording, disable_surveys };
          });
          assert.deepEqual(config, {
            api_host: "https://eu.i.posthog.com",
            defaults: "2026-08-30",
            cookieless_mode: "always",
            person_profiles: "never",
            autocapture: false,
            capture_heatmaps: false,
            capture_dead_clicks: false,
            capture_performance: false,
            capture_exceptions: false,
            disable_session_recording: true,
            disable_surveys: true,
          });
          await t.until(() => page.seen.events.includes("$pageview"), "a $pageview event posted to eu.i.posthog.com (answered by the driver)", 20000);
          assert.deepEqual(page.seen.events, ["$pageview"], "one page view and no other event on load");
          t.note(`${lang}: SDK loaded; requests: ${[...new Set(page.seen.analytics)].join(", ")}; events: ${page.seen.events.join(", ")}`);
        });
      },
    },
    {
      id: "analytics-writes-no-storage",
      async run(t) {
        const page = await t.page();
        await page.open("/");
        await sdkLoaded(t, page);
        await t.until(() => page.seen.events.includes("$pageview"), "a $pageview event", 20000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        const storage = await page.evaluate(() => ({ cookie: document.cookie, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
        assert.deepEqual(storage, { cookie: "", local: [], session: [] });
        assert.deepEqual(await page.context().cookies(), []);
      },
    },
    {
      id: "analytics-absent-elsewhere",
      async run(t) {
        for (const route of ["/legal-notice", "/fr/mentions-legales", "/missing", "/fr/missing"]) {
          const page = await t.page();
          await page.open(route);
          await page.waitForLoadState("networkidle");
          assert.deepEqual(page.seen.analytics, [], `${route} contacts PostHog`);
          assert.equal(await page.evaluate(() => typeof window.posthog), "undefined", route);
        }
      },
    },
  ],
};

const buildAndDeploy = {
  id: "build-and-deploy",
  checks: [
    {
      id: "ci-checks",
      targets: ["local"],
      async run(t) {
        for (const [cmd, ...args] of [["cargo", "fmt", "--", "--check"], ["cargo", "clippy", "--", "-D", "warnings"], ["cargo", "test"], ["cargo", "build", "--release"], ["npm", "test"]]) {
          const res = t.run(cmd, args);
          assert.equal(res.code, 0, `${cmd} ${args.join(" ")}\n${res.out.split("\n").slice(-10).join("\n")}`);
        }
      },
    },
    {
      id: "image-serves",
      targets: ["image"],
      async run(t) {
        for (const route of ["/", "/fr", "/static/styles.css", "/static/og-image.png"]) {
          assert.equal((await t.get(route)).status, 200, route);
        }
        const served = await t.get("/static/main.js");
        assert.ok(served.bytes.equals(fs.readFileSync(path.join(t.root, "static/main.js"))), "the image carries static/ from this checkout");
      },
    },
    {
      id: "deploy-pipeline",
      targets: ["prod"],
      async run(t) {
        t.run("git", ["fetch", "--quiet", "origin", "main"]);
        const head = t.run("git", ["rev-parse", "origin/main"]).out;
        const listed = t.run("gh", ["run", "list", "--workflow", "rust.yml", "--branch", "main", "--limit", "1", "--json", "databaseId,headSha,status,conclusion"]);
        assert.equal(listed.code, 0, listed.out);
        const [run] = JSON.parse(listed.out);
        assert.equal(run.headSha, head, "the newest rust.yml run on main is for origin/main");
        assert.equal(`${run.status} ${run.conclusion}`, "completed success");
        const jobs = Object.fromEntries(JSON.parse(t.run("gh", ["run", "view", String(run.databaseId), "--json", "jobs"]).out).jobs.map((job) => [job.name, job.conclusion]));
        assert.deepEqual(jobs, { build: "success", fmt: "success", clippy: "success", test: "success", browser: "success", deploy: "success", rollout: "success" });
        t.note(`run ${run.databaseId} for ${head.slice(0, 12)}: ${Object.keys(jobs).join(", ")} all succeeded`);
      },
    },
    {
      id: "live-release",
      targets: ["prod"],
      async run(t) {
        t.run("git", ["fetch", "--quiet", "origin", "main"]);
        for (const file of ["static/styles.css", "static/main.js"]) {
          const live = await t.get(`/${file}`);
          assert.ok(live.bytes.equals(t.originMain(file)), `${file} differs from origin/main`);
        }
        const source = t.originMain("src/main.rs").toString();
        const constant = (name) => source.match(new RegExp(`const ${name}: &str = "(.*?)";`))[1];
        const homePage = await t.get("/");
        assert.ok(homePage.text.includes(`/static/og-image.png?v=${constant("ASSET_VERSION")}"`), "ASSET_VERSION of origin/main");
        const sitemap = await t.get("/sitemap.xml");
        assert.ok(sitemap.text.includes(`<lastmod>${constant("LAST_MODIFIED")}</lastmod>`), "LAST_MODIFIED of origin/main");
        t.note(`production serves ASSET_VERSION ${constant("ASSET_VERSION")} and LAST_MODIFIED ${constant("LAST_MODIFIED")} from origin/main`);
      },
    },
  ],
};

export const FEATURES = [home, interactions, legalNotice, redirects, notFound, crawlersAndAssets, analytics, buildAndDeploy];
