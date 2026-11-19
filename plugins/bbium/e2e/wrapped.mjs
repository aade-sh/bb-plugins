// Hint regression test on a fixture page, no running bb needed.
//   node e2e/wrapped.mjs              # hints.ts from the working tree
//   HINTS_REF=<git ref> node e2e/wrapped.mjs   # hints.ts from a commit (before/after)
//   SHOT=/abs/path.png node e2e/wrapped.mjs     # screenshot with hints open
// A link that wraps to two lines has an empty bounding-box center: the old
// center hit test missed it. Covered links must still get no label.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url);
const source = (file) =>
  process.env.HINTS_REF && file === "hints.ts"
    ? execFileSync("git", ["show", `${process.env.HINTS_REF}:${file}`], { cwd: root, encoding: "utf8" })
    : readFileSync(new URL(file, root), "utf8");
const js = (file) => stripTypeScriptTypes(source(file)).replaceAll('.ts"', '.js"');

const mono = "font: 16px/24px monospace; width: 20ch; margin: 0 0 24px";
const page_html = `<!doctype html><html><body style="margin:24px;font:16px sans-serif">
<p style="${mono}">aaaaaaaaaaaaaa <a id="wrapped" href="#w">bbbb cccc</a> dddd</p>
<p><a id="normal" href="#n">Normal link</a> <button id="button">Button</button></p>
<p style="position:relative;width:max-content"><a id="covered" href="#c">Covered link</a>
  <span style="position:absolute;inset:-4px;background:#fdd"></span></p>
<div id="box" style="${mono};height:24px;overflow:auto">
  <p style="margin:0">aaaaaaaaaaaaaa <a id="scrolled" href="#s">bbbb cccc</a> dddd</p><p>filler</p><p>filler</p></div>
<script type="module">
  import { createHints } from "/hints.js";
  import { buildCss, parseTheme } from "/style.js";
  const style = document.createElement("style");
  style.textContent = buildCss(parseTheme(undefined), "");
  document.head.append(style);
  document.getElementById("box").scrollTop = 24;
  // el.click() carries no coordinates; pointerdown carries the ones bbium aimed at.
  window.clicks = [];
  let onTarget = false;
  document.addEventListener("pointerdown", (e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    onTarget = !!hit && e.target.contains(hit);
  }, true);
  document.addEventListener("click", (e) => {
    e.preventDefault();
    window.clicks.push({ id: e.target.closest("[id]")?.id, onTarget });
  }, true);
  const hints = createHints(() => "sadfjklewcmpgh");
  document.addEventListener("keydown", (e) => hints.active() ? hints.onKey(e) : e.key === "f" && hints.enter(), true);
  window.ready = true;
</script></body></html>`;

const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 320 } });
  await page.route("http://fixture.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: page_html });
    return route.fulfill({ contentType: "text/javascript", body: js(path.slice(1).replace(/\.js$/, ".ts")) });
  });
  await page.goto("http://fixture.test/");
  await page.waitForFunction(() => window.ready);

  // Guard the fixture itself: the links must wrap with an empty center.
  const fixture = await page.evaluate(() =>
    ["wrapped", "scrolled"].map((id) => {
      const a = document.getElementById(id);
      const r = a.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, lines: a.getClientRects().length, centerMisses: !a.contains(hit) };
    }),
  );
  check("fixture: links wrap, center misses", fixture.every((f) => f.lines === 2 && f.centerMisses), JSON.stringify(fixture));

  await page.keyboard.press("f");
  const labels = await page.$$eval("[data-bbium-root] .bbium-hint", (ns) =>
    ns.filter((n) => n.style.display !== "none").map((n) => {
      const r = n.getBoundingClientRect();
      return { label: n.textContent, left: r.left, top: r.top };
    }),
  );
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.keyboard.press("Escape");

  // Activate every label once and record what got clicked and where.
  const targets = {};
  for (const { label } of labels) {
    await page.keyboard.press("f");
    for (const c of label) await page.keyboard.press(c);
    const click = await page.evaluate(() => window.clicks.pop());
    if (click) targets[click.id] = { label, onTarget: click.onTarget };
  }
  console.log(JSON.stringify({ labels: labels.length, targets }));

  for (const id of ["normal", "button", "wrapped", "scrolled"]) {
    check(`${id} gets a label that clicks it`, !!targets[id]);
    if (targets[id]) check(`${id} click lands on the element`, targets[id].onTarget);
  }
  check("covered link gets no label", !targets.covered);
  check("no stray labels", labels.length === Object.keys(targets).length, `${labels.length} labels`);
} finally {
  await browser.close();
}
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
