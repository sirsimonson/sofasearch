/**
 * E2E: voting flow against a running Couch-Check instance.
 * Usage: node scripts/e2e_votes.mjs [baseURL]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:8100";
const ID = "012";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " – " + detail : ""}`);
};

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ channel: "chrome" });
}
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(`#tbody tr[data-id="${ID}"]`);
const row = page.locator(`#tbody tr[data-id="${ID}"]`);
const upBtn = row.locator(".vote.up");
const downBtn = row.locator(".vote.down");
const upCount = async () => Number(await upBtn.locator("[data-up]").innerText());
const downCount = async () => Number(await downBtn.locator("[data-down]").innerText());

const before = await upCount();
await upBtn.click();
await page.waitForTimeout(400);
check("Upvote erhöht Zähler", (await upCount()) === before + 1, `${before} → ${await upCount()}`);
check("Upvote ist aktiv", (await upBtn.getAttribute("class")).includes("active"));

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(`#tbody tr[data-id="${ID}"]`);
check("Vote überlebt Reload", (await upCount()) === before + 1 && (await upBtn.getAttribute("class")).includes("active"));

await page.locator(`#tbody tr[data-id="${ID}"] .vote.up`).click();
await page.waitForTimeout(400);
check("Erneuter Klick nimmt Upvote zurück", (await upCount()) === before && !(await upBtn.getAttribute("class")).includes("active"));

const dBefore = await downCount();
await page.locator(`#tbody tr[data-id="${ID}"] .vote.down`).click();
await page.waitForTimeout(400);
check("Downvote erhöht Zähler", (await downCount()) === dBefore + 1);
check("Downvote aktiv", (await downBtn.getAttribute("class")).includes("active"));

// Toggle off for cleanup
await page.locator(`#tbody tr[data-id="${ID}"] .vote.down`).click();
await page.waitForTimeout(400);
check("Downvote zurückgenommen", (await downCount()) === dBefore);

// Detail dialog voting must not open a second dialog / break
await page.locator(`#tbody tr[data-id="${ID}"] .title`).click();
await page.waitForSelector("#detail[open]");
const dlgUp = page.locator("#detail .vote.up");
const dBefore2 = Number(await dlgUp.locator("[data-up]").innerText());
await dlgUp.click();
await page.waitForTimeout(400);
check("Vote im Detail-Dialog", Number(await dlgUp.locator("[data-up]").innerText()) === dBefore2 + 1);
check("Detail bleibt offen", await page.locator("#detail[open]").count() === 1);
await page.locator("#detail .vote.up").click();
await page.waitForTimeout(300);

// API robustness
const bad = await page.request.post(`${BASE}/api/vote`, { data: { couchId: "nope", voterId: "testvoter123", value: 1 } });
check("Unbekannte Couch wird abgelehnt", bad.status() === 400);
const bad2 = await page.request.post(`${BASE}/api/vote`, { data: { couchId: ID, voterId: "x", value: 1 } });
check("Ungültige Voter-ID wird abgelehnt", bad2.status() === 400);

check("Keine JS-Fehler", errors.length === 0, errors.join("; "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
