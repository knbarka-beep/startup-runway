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
const consoleErrors = [];
const ignoredErrors = [];   // logged, not counted
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
          // Only errors from the site's own scripts count: Edge injects a script of its own that can throw.
          if (m.method === "Runtime.exceptionThrown") {
            const d = m.params.exceptionDetails;
            const where = d.url || d.stackTrace?.callFrames?.[0]?.url || "";
            if (where.startsWith(SITE)) consoleErrors.push(d.exception?.description ?? d.text);
            else ignoredErrors.push(`${where || "(no url)"}: ${d.exception?.description?.split("\n")[0] ?? d.text}`);
          }
          if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
            consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
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
  await send("Runtime.enable");

  // Redesign comparison: `node scripts/screenshots.mjs before` (or `after`) only takes the
  // comparison shots into docs/screenshots/redesign-v2/ and stops. (The first redesign's set is in redesign/.)
  const tag = process.argv[2];
  // `after-fix` takes only desktop light and 375 px light.
  if (tag === "before" || tag === "after" || tag === "after-fix") {
    mkdirSync(join(shots, "redesign-v2"), { recursive: true });
    for (const [name, theme, width, mobile] of [["desktop-light", "light", 1440, false], ["desktop-dark", "dark", 1440, false],
      ["mobile-light", "light", 375, true]]) {
      if (tag === "after-fix" && name === "desktop-dark") continue;
      await open(`/?theme=${theme}`, width, mobile);
      await shoot(`redesign-v2/${name}-${tag}.png`);
    }
    if (tag === "after-fix") process.exit(0);
    // The scenario panel with Hiring push selected (.main holds the chart and the scenario controls).
    await open("/?theme=light", 1440);
    await click("Hiring push");
    await wait(400);
    await shoot(`redesign-v2/scenario-hiring-push-${tag}.png`, ".main");
    await js(`(() => { const s = document.getElementById('month');
      const i = [...s.options].findIndex(o => o.text === 'Sep 2026');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, String(i));
      s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await wait(400);
    await shoot(`redesign-v2/update-sep-2026-${tag}.png`, ".update");
    process.exit(0);
  }

  // "(fictional)" must be visible on every page.
  for (const path of ["/", "/method/"]) {
    await open(path + "?theme=light", 1440);
    const ok = await js("document.body.innerText.includes('(fictional)')");
    console.log(`  ${ok ? "PASS" : "FAIL"}  "(fictional)" visible on ${path}`);
    failed ||= !ok;
  }

  // Keyboard: Tab must reach every preset button and slider, each with a visible focus ring.
  console.log("Keyboard check (Tab):");
  await open("/?theme=light", 1440);
  const reached = new Set();
  let noRing = [];
  for (let i = 0; i < 40; i++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const f = await js(`(() => { const e = document.activeElement; const cs = getComputedStyle(e);
      return { id: e.id || e.textContent.trim(), ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 }; })()`);
    reached.add(f.id);
    if (!f.ring) noRing.push(f.id);
  }
  const wanted = ["Current plan", "Hiring push", "Downside", "Reset", "hires", "students", "growth", "churn", "opex", "funding"];
  const missing = wanted.filter((w) => !reached.has(w));
  noRing = [...new Set(noRing)].filter((n) => wanted.includes(n));
  const keyOk = missing.length === 0 && noRing.length === 0;
  console.log(`  ${keyOk ? "PASS" : "FAIL"}  presets and sliders reachable by Tab with a focus ring` +
    (missing.length ? `; not reached: ${missing.join(", ")}` : "") + (noRing.length ? `; no ring: ${noRing.join(", ")}` : ""));
  failed ||= !keyOk;

  // Tab order and focus ring colour; (i) popovers open with Enter and close with Esc, focus back on the button.
  const order = await js(`(() => { const all = [...document.querySelectorAll('a[href], button, select, input, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((x) => x.offsetParent !== null && x.tabIndex >= 0);
    return all.slice(0, 14).map((x) => x.id || x.getAttribute('aria-label') || x.textContent.trim().slice(0, 20)); })()`);
  console.log(`  tab order (first 14): ${order.join(" > ")}`);
  await open("/?theme=light", 1440);
  // Enter needs its text ("\r") to activate a button, as a real key press would.
  const key = async (k, code, vk) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(k === "Enter" ? { text: "\r" } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  };
  for (let i = 0; i < 10 && !(await js("document.activeElement.classList.contains('info-btn')")); i++) await key("Tab", "Tab", 9);
  const ringNow = await js("getComputedStyle(document.activeElement).outlineColor");
  await key("Enter", "Enter", 13);
  await wait(150);
  const opened = await js("!!document.querySelector('.info-pop')");
  await key("Escape", "Escape", 27);
  await wait(150);
  const pop = { opened, ring: ringNow, accent: await js("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()"),
    closed: await js("!document.querySelector('.info-pop')"), back: await js("document.activeElement.classList.contains('info-btn')") };
  const hex = pop.accent.replace("#", "");
  const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
  const popOk = pop.opened && pop.closed && pop.back && pop.ring === rgb;
  console.log(`  ${popOk ? "PASS" : "FAIL"}  (i) popover: opens ${pop.opened}, Esc closes ${pop.closed}, focus back ${pop.back}, ring ${pop.ring} = accent ${rgb}`);
  failed ||= !popOk;
  // Popovers that exist must be keyboard buttons, and every one must have an accessible name.
  const unnamed = await js("[...document.querySelectorAll('.info-btn')].filter((b) => !b.getAttribute('aria-label')).length");
  console.log(`  ${unnamed === 0 ? "PASS" : "FAIL"}  every (i) button has a name (${await js("document.querySelectorAll('.info-btn').length")} buttons)`);
  failed ||= unnamed !== 0;

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
  // No sideways scrolling on a phone, and no transitions when the visitor asks for reduced motion.
  await open("/?theme=light", 375, true);
  const sw = await js("[document.documentElement.scrollWidth, document.documentElement.clientWidth]");
  const swOk = sw[0] <= sw[1];
  console.log(`  ${swOk ? "PASS" : "FAIL"}  no horizontal scroll at 375 px (scrollWidth ${sw[0]}, clientWidth ${sw[1]})`);
  failed ||= !swOk;
  // On a phone "Adjust assumptions" starts closed, and an open popover stays inside the screen.
  const phone = await js(`(async () => { const closed = !document.querySelector('details.assumptions').open;
    document.querySelector('.kpi .info-btn').click(); await new Promise((r) => setTimeout(r, 100));
    const r = document.querySelector('.info-pop').getBoundingClientRect();
    return { closed, inside: r.left >= 0 && r.right <= document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; })()`);
  const phoneOk = phone.closed && phone.inside && phone.sw <= sw[1];
  console.log(`  ${phoneOk ? "PASS" : "FAIL"}  375 px: assumptions closed ${phone.closed}, popover inside the screen ${phone.inside}`);
  failed ||= !phoneOk;
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await open("/?theme=light", 1440);
  const dur = await js("getComputedStyle(document.querySelector('.btn')).transitionDuration");
  const rmOk = dur.split(",").every((d) => parseFloat(d) === 0);
  console.log(`  ${rmOk ? "PASS" : "FAIL"}  reduced motion: button transition ${dur}`);
  failed ||= !rmOk;
  await send("Emulation.setEmulatedMedia", { features: [] });

  const errOk = consoleErrors.length === 0;
  console.log(`  ${errOk ? "PASS" : "FAIL"}  no console errors` + (errOk ? "" : `: ${consoleErrors.join(" | ")}`));
  failed ||= !errOk;
  for (const e of new Set(ignoredErrors)) console.log(`  (ignored, not from the site: ${e})`);
} finally {
  ws?.close();
  edge.kill();
  server.kill();
}
process.exit(failed ? 1 : 0);
