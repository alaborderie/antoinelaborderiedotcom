#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { FEATURES, PROD } from "./features.mjs";

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, "../../..");
const WORK = path.join(ROOT, "target/verify-antoinelaborderiedotcom");
const RUNS = path.join(WORK, "runs");
const INSTANCE = path.join(WORK, "instance.json");
const BINARY = path.join(ROOT, "target/release/antoinelaborderiedotcom");
const PORT = 3000;
const BUILD_INPUTS = ["src", "templates", "static/main.js", "static/styles.css", "static/favicon.svg", "Cargo.toml", "Cargo.lock"];
const IMAGE_INPUTS = [...BUILD_INPUTS, "static", "Dockerfile", ".dockerignore"];

const USAGE = `usage: verify.mjs <command>
  launch [--target local|image]   build this checkout and start one instance (default: local)
  doctor [--target prod]          is the instance (or production) worth driving? read-only
  drive <feature...|all> [--target prod]
                                  run the feature checks against the instance, or production read-only
  list                            print every feature and check id; fails when features/ and the driver disagree
  cleanup                         stop what launch started; evidence stays in ${path.relative(ROOT, RUNS)}`;

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, ...opts });
  return { code: res.status ?? 1, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

function must(cmd, args, opts) {
  const res = sh(cmd, args, opts);
  if (res.code) throw new Error(`${cmd} ${args.join(" ")} exited ${res.code}\n${res.out.split("\n").slice(-15).join("\n")}`);
  return res.out;
}

function request(url, headers = {}) {
  const target = new URL(url);
  const lib = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(target, { method: "GET", headers, timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, bytes, text: bytes.toString("utf8") });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout: ${url}`)));
    req.on("error", reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(probe, what, ms = 8000) {
  const deadline = Date.now() + ms;
  let last;
  for (;;) {
    try {
      last = await probe();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
    await sleep(100);
  }
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function runDir(label) {
  const dir = path.join(RUNS, `${stamp()}-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readInstance() {
  return fs.existsSync(INSTANCE) ? JSON.parse(fs.readFileSync(INSTANCE, "utf8")) : null;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

function newestInput(inputs = BUILD_INPUTS) {
  let newest = { mtime: 0, file: "" };
  const visit = (file) => {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) return fs.readdirSync(file).forEach((name) => visit(path.join(file, name)));
    if (stat.mtimeMs > newest.mtime) newest = { mtime: stat.mtimeMs, file: path.relative(ROOT, file) };
  };
  inputs.forEach((input) => visit(path.join(ROOT, input)));
  return newest;
}

async function ready(base) {
  await until(async () => (await request(`${base}/`)).status === 200, `${base}/ to answer 200`, 15000);
  await until(async () => (await request(`${base}/static/styles.css`)).status === 200, "static/ to be served", 5000);
}

const TARGETS = {
  local: {
    async launch(dir) {
      if (await portBusy(PORT)) {
        const owner = sh("ss", ["-ltnpH", `sport = :${PORT}`]).out;
        throw new Error(`port ${PORT} is already in use; this app cannot bind another port. Owner: ${owner || "unknown"}. Use --target image, or stop that process yourself.`);
      }
      console.log("cargo build --release");
      must("cargo", ["build", "--release"]);
      const log = fs.openSync(path.join(dir, "server.log"), "a");
      const child = spawn(BINARY, [], { cwd: ROOT, detached: true, stdio: ["ignore", log, log] });
      child.unref();
      return { pid: child.pid, base: `http://127.0.0.1:${PORT}` };
    },
    doctor(instance) {
      const link = (name) => {
        try {
          return fs.readlinkSync(`/proc/${instance.pid}/${name}`);
        } catch {
          return null;
        }
      };
      const newest = newestInput();
      return [
        [`process ${instance.pid} is alive`, pidAlive(instance.pid)],
        [`process runs ${path.relative(ROOT, BINARY)}`, link("exe") === BINARY],
        ["process works from the repository root", link("cwd") === ROOT],
        [`port ${PORT} belongs to that process`, sh("ss", ["-ltnpH", `sport = :${PORT}`]).out.includes(`pid=${instance.pid},`)],
        [`binary is newer than its inputs (newest: ${newest.file})`, fs.statSync(BINARY).mtimeMs >= newest.mtime],
      ];
    },
    async cleanup(instance) {
      let exe = null;
      try {
        exe = fs.readlinkSync(`/proc/${instance.pid}/exe`);
      } catch {}
      if (exe !== BINARY) return console.log(`process ${instance.pid} is gone or is not ours; nothing killed`);
      process.kill(instance.pid, "SIGTERM");
      await until(() => !pidAlive(instance.pid), `process ${instance.pid} to exit`);
      console.log(`stopped process ${instance.pid}`);
    },
  },
  image: {
    async launch(dir) {
      const tag = `verify-antoinelaborderiedotcom:${path.basename(dir)}`;
      console.log(`docker build . --file Dockerfile --tag ${tag}`);
      must("docker", ["build", ".", "--file", "Dockerfile", "--tag", tag]);
      const container = must("docker", ["run", "--detach", "--publish", "127.0.0.1::3000", tag]);
      const port = must("docker", ["port", container, "3000/tcp"]).split(":").pop();
      return { container, tag, base: `http://127.0.0.1:${port}` };
    },
    doctor(instance) {
      const state = sh("docker", ["inspect", "--format", "{{.State.Running}} {{.RestartCount}} {{.Config.Image}} {{.Config.WorkingDir}}", instance.container]).out;
      const head = sh("git", ["rev-parse", "HEAD"]).out;
      const newest = newestInput(IMAGE_INPUTS);
      return [
        [`container ${instance.container.slice(0, 12)} is running from ${instance.tag}`, state.startsWith(`true 0 ${instance.tag}`)],
        ["container works from /app, where static/ was copied", state.endsWith(" /app")],
        [`checkout is still at the commit the image was built from (${instance.head.slice(0, 12)})`, head === instance.head],
        [`no image input changed since the build (newest: ${newest.file})`, newest.mtime <= instance.builtAt],
      ];
    },
    async cleanup(instance) {
      fs.writeFileSync(path.join(instance.dir, "server.log"), sh("docker", ["logs", instance.container]).out);
      console.log(sh("docker", ["rm", "--force", instance.container]).code ? "container already gone" : `removed container ${instance.container.slice(0, 12)}`);
      sh("docker", ["rmi", instance.tag]);
    },
  },
};

async function launch(args) {
  const target = option(args, "--target") ?? "local";
  if (!TARGETS[target]) throw new Error(`unknown launch target ${target}\n${USAGE}`);
  if (readInstance()) throw new Error(`an instance is already recorded in ${INSTANCE}; run cleanup first`);
  if (!fs.existsSync(path.join(ROOT, "node_modules/playwright-core"))) {
    console.log("npm ci");
    must("npm", ["ci"]);
  }
  const { chromium } = await import("playwright-core");
  if (!process.env.CHROME && !fs.existsSync(chromium.executablePath())) {
    console.log("npx playwright-core install chromium");
    must("npx", ["playwright-core", "install", "chromium"]);
  }
  const dir = runDir(`launch-${target}`);
  const instance = { target, dir, builtAt: Date.now(), head: sh("git", ["rev-parse", "HEAD"]).out, ...(await TARGETS[target].launch(dir)) };
  fs.writeFileSync(INSTANCE, JSON.stringify(instance, null, 1));
  try {
    await ready(instance.base);
  } catch (error) {
    await cleanup();
    throw new Error(`${error.message}; see ${path.join(dir, "server.log")}`);
  }
  console.log(`ready: ${target} instance at ${instance.base}\nserver log: ${path.join(dir, "server.log")}`);
}

async function doctor(args) {
  const prod = option(args, "--target") === "prod";
  const instance = prod ? null : readInstance();
  if (!prod && !instance) throw new Error("no instance recorded; run launch first, or pass --target prod");
  const base = prod ? PROD : instance.base;
  const checks = prod ? [] : TARGETS[instance.target].doctor(instance);
  const home = await request(`${base}/`).catch((error) => ({ status: error.message, text: "" }));
  checks.push([`GET ${base}/ answers 200 (got ${home.status})`, home.status === 200]);
  checks.push(["the answer is this site's home page", home.text.includes('<link rel="canonical" href="https://antoinelaborderie.com/"')]);
  for (const [what, ok] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (checks.some(([, ok]) => !ok)) throw new Error(prod ? "production is not answering as expected" : "do not drive this instance: run cleanup, then launch");
  console.log(`healthy: ${prod ? "prod" : instance.target} at ${base}`);
}

async function cleanup() {
  const instance = readInstance();
  if (!instance) return console.log("nothing to clean: no instance recorded");
  await TARGETS[instance.target].cleanup(instance);
  fs.rmSync(INSTANCE);
  console.log(`evidence kept in ${RUNS}`);
}

async function list() {
  const dir = path.join(SKILL, "features");
  const index = fs.readFileSync(path.join(dir, "README.md"), "utf8");
  const drift = [];
  for (const feature of FEATURES) {
    console.log(`${feature.id}  (features/${feature.id}.md)`);
    for (const check of feature.checks) console.log(`  ${check.id}  [${(check.targets ?? ["local", "image", "prod"]).join(", ")}]`);
    const file = path.join(dir, `${feature.id}.md`);
    if (!fs.existsSync(file)) {
      drift.push(`features/${feature.id}.md is missing`);
      continue;
    }
    if (!index.includes(`(./${feature.id}.md)`)) drift.push(`features/README.md does not link ${feature.id}.md`);
    const section = fs.readFileSync(file, "utf8").split("## Sub-features")[1]?.split("\n## ")[0] ?? "";
    const documented = [...section.matchAll(/^- `([\w-]+)`/gm)].map((match) => match[1]).sort().join(" ");
    const driven = feature.checks.map((check) => check.id).sort().join(" ");
    if (documented !== driven) drift.push(`features/${feature.id}.md lists [${documented}] but the driver runs [${driven}]`);
  }
  for (const name of fs.readdirSync(dir)) {
    if (name !== "README.md" && !FEATURES.some((feature) => `${feature.id}.md` === name)) drift.push(`features/${name} has no checks in features.mjs`);
  }
  if (drift.length) throw new Error(`the map and the driver disagree:\n${drift.join("\n")}`);
  console.log("the map and the driver list the same features and checks");
}

async function drive(args) {
  const prod = option(args, "--target") === "prod";
  const wanted = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--target");
  if (!wanted.length) throw new Error(`name the features to drive, or all\n${USAGE}`);
  const features = wanted.includes("all") ? FEATURES : wanted.map((id) => {
    const feature = FEATURES.find((candidate) => candidate.id === id);
    if (!feature) throw new Error(`unknown feature ${id}; run list`);
    return feature;
  });
  const instance = prod ? null : readInstance();
  if (!prod && !instance) throw new Error("no instance recorded; run launch first, or pass --target prod");
  const target = prod ? "prod" : instance.target;
  const base = prod ? PROD : instance.base;
  const dir = runDir(`drive-${target}`);
  const lines = [];
  const say = (line) => (console.log(line), lines.push(line));
  say(`target ${target} at ${base}, commit ${sh("git", ["rev-parse", "HEAD"]).out}`);

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chromium", executablePath: process.env.CHROME || undefined, args: ["--disable-blink-features=AutomationControlled"] });
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace("HeadlessChrome", "Chrome");
  await probe.close();
  say(`browser Chromium ${browser.version()}`);
  const results = [];
  try {
    for (const feature of features) {
      for (const check of feature.checks) {
        const name = `${feature.id}/${check.id}`;
        if (check.targets && !check.targets.includes(target)) {
          results.push({ feature: feature.id, check: check.id, status: "not-run", detail: `runs on ${check.targets.join(", ")} only` });
          say(`N/A  ${name} (runs on ${check.targets.join(", ")} only)`);
          continue;
        }
        const notes = [];
        const contexts = [];
        const toolkit = makeToolkit({ base, target, dir, name, notes, contexts, browser, userAgent });
        let failure = null;
        try {
          await check.run(toolkit);
        } catch (error) {
          failure = error.message.split("\n").slice(0, 12).join("\n");
          for (const context of contexts) {
            for (const page of context.pages()) await toolkit.shot(page, "failure").catch(() => {});
          }
        }
        await Promise.all(contexts.map((context) => context.close().catch(() => {})));
        results.push({ feature: feature.id, check: check.id, status: failure ? "fail" : "pass", detail: failure, notes });
        say(`${failure ? "FAIL" : "PASS"} ${name}`);
        notes.forEach((note) => say(`       ${note}`));
        if (failure) say(`       ${failure.replace(/\n/g, "\n       ")}`);
      }
    }
  } finally {
    await browser.close();
  }
  const count = (status) => results.filter((result) => result.status === status).length;
  say(`${count("pass")} passed, ${count("fail")} failed, ${count("not-run")} not run on this target`);
  say(`evidence: ${dir}`);
  fs.writeFileSync(path.join(dir, "run.log"), `${lines.join("\n")}\n`);
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ target, base, results }, null, 1));
  if (count("fail")) process.exitCode = 1;
}

function makeToolkit({ base, target, dir, name, notes, contexts, browser, userAgent }) {
  const note = (text) => notes.push(text);
  const file = (suffix) => path.join(dir, `${name.replace("/", ".")}.${suffix}`);
  const toolkit = {
    target,
    root: ROOT,
    note,
    until,
    url: (route) => `${base}${route}`,
    async get(route, headers = {}) {
      const res = await request(`${base}${route}`, headers);
      note(`GET ${route} -> ${res.status}${res.headers.location ? ` ${res.headers.location}` : ""}`);
      return res;
    },
    async www(route) {
      const res = target === "prod"
        ? await request(`https://www.antoinelaborderie.com${route}`)
        : await request(`${base}${route}`, { host: "www.antoinelaborderie.com" });
      note(`GET ${route} with Host www.antoinelaborderie.com -> ${res.status} ${res.headers.location ?? ""}`);
      return res;
    },
    run(cmd, args) {
      const res = sh(cmd, args);
      fs.writeFileSync(file(`${[cmd, ...args].join("-").replace(/[^\w.-]+/g, "_").slice(0, 60)}.log`), `${res.out}\n`);
      note(`${cmd} ${args.join(" ")} -> exit ${res.code}`);
      return res;
    },
    originMain(name) {
      const res = spawnSync("git", ["show", `origin/main:${name}`], { cwd: ROOT, maxBuffer: 64 << 20 });
      if (res.status) throw new Error(`git show origin/main:${name} exited ${res.status}`);
      return res.stdout;
    },
    async page({ js = true } = {}) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: js, userAgent });
      contexts.push(context);
      const seen = { errors: [], analytics: [], events: [] };
      await context.route((url) => url.hostname.endsWith("posthog.com"), (route) => {
        const url = new URL(route.request().url());
        seen.analytics.push(`${url.host}${url.pathname}`);
        if (url.hostname !== "eu.i.posthog.com") return route.continue();
        const body = route.request().postDataBuffer();
        if (body) {
          const payload = JSON.parse(body[0] === 0x1f && body[1] === 0x8b ? zlib.gunzipSync(body) : body);
          seen.events.push(...(payload.batch ?? [payload]).map((event) => event.event));
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"Ok"}' });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => seen.errors.push(String(error)));
      page.seen = seen;
      page.open = async (route) => {
        const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        note(`open ${route} -> ${response.status()} ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
        return response;
      };
      return page;
    },
    async shot(page, label) {
      const image = file(`${label}.png`);
      await page.screenshot({ path: image });
      note(`screenshot ${path.basename(image)}`);
    },
  };
  return toolkit;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const COMMANDS = { launch, doctor, drive, list, cleanup };
const [command, ...args] = process.argv.slice(2);
if (!COMMANDS[command]) {
  console.error(USAGE);
  process.exit(2);
}
COMMANDS[command](args).catch((error) => {
  console.error(`verify: ${error.message}`);
  process.exit(1);
});
