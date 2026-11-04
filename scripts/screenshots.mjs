// Screenshots and a touch check with headless Microsoft Edge.
// Needs: web/out built (cd web; npm run build), Python (for a local web server), Node 22+.
// Run from the repo root:  node scripts/screenshots.mjs
//
// Edge is driven through its DevTools protocol (a WebSocket built into Node), so the
// script can set an exact 375 px phone screen, simulate a finger on a sparkline,
// click preset buttons and photograph single cards. No extra packages needed.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "docs", "screenshots");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SITE = "http://localhost:8765";
const PORT = 9333;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- start servers
const server = spawn("python", ["-m", "http.server", "8765", "--directory", join(root, "web", "out")], { stdio: "ignore" });
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(tmpdir(), "runway-edge-profile")}`, "about:blank"], { stdio: "ignore" });

let ws, nextId = 0;
const pending = new Map();
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
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((p) => p.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
  await send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 900 : 2400, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
  await send("Page.navigate", { url: SITE + path });
  for (let i = 0; i < 100; i++) {
    if (await js("document.readyState === 'complete' && !!document.querySelector('main')")) break;
    await wait(100);
  }
  await wait(800);   // let React hydrate and the charts measure their size
}

// Photograph the whole page, or one element when a CSS selector is given.
async function shoot(file, selector) {
  let clip;
  if (selector) {
    clip = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x + scrollX - 8, y: r.y + scrollY - 8, width: r.width + 16, height: r.height + 16, scale: 1 }; })()`);
  } else {
    // Make the screen as tall as the page first, so the charts draw once at their final size.
    const h = await js("document.documentElement.scrollHeight");
    await send("Emulation.setDeviceMetricsOverride", { width: current.width, height: h, deviceScaleFactor: 1, mobile: current.mobile });
    await wait(800);
    const w = await js("document.documentElement.clientWidth");
    clip = { x: 0, y: 0, width: w, height: await js("document.documentElement.scrollHeight"), scale: 1 };
  }
  const { data } = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false });
  writeFileSync(join(shots, file), Buffer.from(data, "base64"));
  console.log(`  saved docs/screenshots/${file}`);
}

const click = (text) => js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
const tooltipText = () => js("document.querySelector('.kpi .recharts-tooltip-wrapper')?.textContent ?? ''");

// Put a finger on the first sparkline at `share` (0 to 1) of its width.
async function touchSparkline(type, share) {
  const r = await js(`(() => { const b = document.querySelector('.kpi .recharts-surface').getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  await send("Input.dispatchTouchEvent", { type, touchPoints: [{ x: r.x + r.w * share, y: r.y + r.h / 2 }] });
  await wait(150);
  return tooltipText();
}

// ---------------------------------------------------------------- run
let failed = false;
try {
  mkdirSync(shots, { recursive: true });
  await wait(1500);
  await connect();
  await send("Page.enable");

  console.log("Touch check at 375 px (cash sparkline):");
  await open("/?theme=light", 375, true);
  // A real finger drag fires many small move events. Simulate that, reading the tooltip at three points.
  await touchSparkline("touchStart", 0.05);
  const seen = [];
  for (let i = 1; i <= 19; i++) {
    const text = await touchSparkline("touchMove", 0.05 * (i + 1));
    if (i === 3 || i === 11 || i === 19) seen.push(text);
  }
  const [t1, t2, t3] = seen;
  const pattern = /^[A-Z][a-z]{2} 20\d\d: €[\d.]+$/;
  const ok = [t1, t2, t3].every((t) => pattern.test(t)) && t1 !== t2 && t2 !== t3;
  console.log(`  ${ok ? "PASS" : "FAIL"}  tooltip follows the finger: "${t1}" -> "${t2}" -> "${t3}"`);
  failed ||= !ok;
  await shoot("mobile-sparkline-tooltip.png", ".kpis");
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  console.log("Screenshots:");
  for (const theme of ["light", "dark"]) {
    await open(`/?theme=${theme}`, 1440);
    await shoot(`desktop-${theme}.png`);
    await open(`/?theme=${theme}`, 375, true);
    await shoot(`mobile-${theme}.png`);
  }
  await open("/method/?theme=light", 1200);
  await shoot("method-light.png");

  // Presets: clicking one highlights it; moving a slider afterwards clears the highlight.
  await open("/?theme=light", 1440);
  const activeText = () => js("document.querySelector('.presets button.active')?.textContent ?? 'none'");
  const onLoad = await activeText();
  await click("Hiring push");
  await wait(200);
  const afterClick = await activeText();
  await js(`(() => { const el = document.getElementById('students');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '5');
    el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await wait(200);
  const afterSlider = await activeText();
  await click("Reset");
  await wait(200);
  const afterReset = await activeText();
  const presetOk = onLoad === "Current plan" && afterClick === "Hiring push" && afterSlider === "none" && afterReset === "Current plan";
  console.log(`  ${presetOk ? "PASS" : "FAIL"}  presets: on load "${onLoad}", after click "${afterClick}", ` +
    `after moving a slider "${afterSlider}", after Reset "${afterReset}"`);
  failed ||= !presetOk;

  // Photograph Current plan (the default) and Hiring push, and print the line under the chart for all three.
  for (const preset of ["Current plan", "Hiring push", "Downside"]) {
    await click(preset);
    await wait(300);
    const line = await js("document.querySelector('.projection-line').textContent");
    console.log(`  ${preset}: ${line}`);
    if (preset !== "Downside") await shoot(`preset-${preset.toLowerCase().replace(" ", "-")}.png`, ".main");
  }

  // Investor update cards for Apr and Jul 2026.
  for (const month of ["Apr 2026", "Jul 2026"]) {
    await js(`(() => { const s = document.getElementById('month');
      const i = [...s.options].findIndex(o => o.text === '${month}');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, String(i));
      s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await wait(400);
    await shoot(`update-${month.toLowerCase().replace(" ", "-")}.png`, ".update");
  }
} finally {
  ws?.close();
  edge.kill();
  server.kill();
}
process.exit(failed ? 1 : 0);
