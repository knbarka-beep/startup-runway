// Click-through of the LIVE site in headless Microsoft Edge, at desktop width and at 375 px with touch.
// Run from the repo root:  node scripts/live_check.mjs https://nordlys-runway.vercel.app
// Prints PASS/FAIL per check and saves screenshots to docs/screenshots/live/.
// Same DevTools-protocol approach as scripts/screenshots.mjs, but no local server.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SITE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!SITE.startsWith("https://")) { console.log("Usage: node scripts/live_check.mjs https://..."); process.exit(2); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "docs", "screenshots", "live");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "runway-edge-live")}`, "about:blank"], { stdio: "ignore" });

let ws, nextId = 0;
const pending = new Map();
let siteErrors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((p) => p.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
          // Only errors from the site's own scripts count (Edge injects a script of its own that can throw).
          if (m.method === "Runtime.exceptionThrown") {
            const d = m.params.exceptionDetails;
            const where = d.url || d.stackTrace?.callFrames?.[0]?.url || "";
            if (where.startsWith(SITE)) siteErrors.push(d.exception?.description ?? d.text);
          }
          if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
            siteErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
        };
        return;
      }
    } catch {}
    await wait(200);
  }
  throw new Error("Could not connect to Edge");
}

let current = { width: 1440, mobile: false };
async function open(path, width, mobile = false) {
  current = { width, mobile };
  await send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 900 : 3200, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
  await send("Page.navigate", { url: SITE + path });
  for (let i = 0; i < 150; i++) {
    if (await js("document.readyState === 'complete' && !!document.querySelector('main')")) break;
    await wait(100);
  }
  await wait(1200);
}
async function shoot(file, selector) {
  const clip = selector
    ? await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: r.x + scrollX - 8, y: r.y + scrollY - 8, width: r.width + 16, height: r.height + 16, scale: 1 }; })()`)
    : { x: 0, y: 0, width: current.width, height: current.mobile ? 900 : 1400, scale: 1 };
  const { data } = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false });
  writeFileSync(join(shots, file), Buffer.from(data, "base64"));
}
const click = (text) => js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
const pickMonth = (label) => js(`(() => { const s = document.getElementById('month');
  const i = [...s.options].findIndex(o => o.text === ${JSON.stringify(label)});
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, String(i));
  s.dispatchEvent(new Event('change', { bubbles: true })); })()`);

let failed = false;
const report = (ok, text) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${text}`); failed ||= !ok; };

try {
  mkdirSync(shots, { recursive: true });
  await wait(1500);
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");

  for (const [name, width, mobile] of [["desktop", 1440, false], ["375 px", 375, true]]) {
    const tag = mobile ? "mobile" : "desktop";
    console.log(`${name}:`);
    siteErrors = [];
    await open("/?theme=light", width, mobile);
    report(await js("!!document.querySelector('.kpis')"), "page loads");
    report(await js("document.body.innerText.includes('(fictional)')"), '"(fictional)" visible');
    await shoot(`${tag}.png`);

    // Presets: the "cash runs out" line after each click.
    const expected = { "Hiring push": "Nov 2027", "Downside": "Nov 2027", "Current plan": "Feb 2028", "Reset": "Feb 2028" };
    for (const [button, month] of Object.entries(expected)) {
      await click(button);
      await wait(300);
      const line = await js("document.querySelector('.projection-line')?.textContent ?? ''");
      report(line.includes(`runs out in ${month}`), `${button}: "${line}" (expected ${month})`);
    }

    // Investor update card for Jul and Sep 2026: every part present.
    for (const label of ["Jul 2026", "Sep 2026"]) {
      await pickMonth(label);
      await wait(500);
      const parts = await js(`(() => { const c = document.querySelector('.update'); const t = c?.innerText ?? '';
        return { tldr: t.includes('TL;DR'), table: !!c?.querySelector('table.metrics'), high: t.includes('Highlights'),
          low: t.includes('Lowlights'), ask: t.includes('Ask'), check: !!c?.querySelector('.check') }; })()`);
      const missing = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k);
      report(missing.length === 0, `update card ${label}: TL;DR, table, highlights, lowlights, ask, check` +
        (missing.length ? ` (missing: ${missing.join(", ")})` : ""));
      if (!mobile) await shoot(`update-${label.toLowerCase().replace(" ", "-")}.png`, ".update");
    }

    if (mobile) {
      // Touch drag along the cash sparkline.
      await pickMonth("Sep 2026");
      await wait(400);
      await js("scrollTo(0, 0)");
      const r = await js(`(() => { const b = document.querySelector('.kpi .recharts-surface').getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
      const at = (s) => [{ x: r.x + r.w * s, y: r.y + r.h / 2 }];
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0.1) });
      const seen = [];
      for (let s = 0.15; s <= 0.95; s += 0.05) {
        await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(s) });
        await wait(80);
        seen.push(await js("document.querySelector('.kpi .recharts-tooltip-wrapper')?.textContent ?? ''"));
      }
      await shoot("mobile-sparkline.png", ".kpis");
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const good = seen.filter((t) => /^[A-Z][a-z]{2} 20\d\d: €[\d.]+$/.test(t));
      report(new Set(good).size >= 3, `sparkline tooltip follows the finger: "${good[0]}" ... "${good.at(-1)}"`);

      const sw = await js("[document.documentElement.scrollWidth, document.documentElement.clientWidth]");
      report(sw[0] <= sw[1], `no horizontal scroll (scrollWidth ${sw[0]}, clientWidth ${sw[1]})`);
    }

    // Footer GitHub link.
    const href = await js("[...document.querySelectorAll('footer a')].find(a => a.textContent.includes('GitHub'))?.href ?? ''");
    const status = href ? (await fetch(href)).status : 0;
    report(href === "https://github.com/knbarka-beep/startup-runway" && status === 200, `"Code on GitHub" -> ${href} (${status})`);

    // How this works page.
    await open("/method/?theme=light", width, mobile);
    report(await js("document.body.innerText.includes('Known weaknesses')"), 'How this works loads and shows "Known weaknesses"');
    if (!mobile) await shoot("method.png");

    report(siteErrors.length === 0, "no console errors from the site" + (siteErrors.length ? `: ${siteErrors.join(" | ")}` : ""));
  }
} finally {
  ws?.close();
  edge.kill();
}
process.exit(failed ? 1 : 0);
