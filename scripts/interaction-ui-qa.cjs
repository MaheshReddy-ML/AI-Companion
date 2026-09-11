const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("fs");
const output = require("path").resolve(
  process.env.EMORA_QA_OUTPUT || "tmp/ui-qa",
);
fs.mkdirSync(output, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const c = await b.newContext({ viewport: { width: 320, height: 568 } });
  const p = await c.newPage();
  const base = "http://127.0.0.1:8000";
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const checks = [];
  let token;
  try {
    const qaEmail = `qa-focused-${Date.now()}@example.com`;
    const seed = await c.request.post(base + "/api/auth/register", {
      data: {
        name: "QA Focused",
        email: qaEmail,
        password: "Emora-QA-Only-963!",
      },
    });
    token = (await seed.json()).token;
    await p.goto(base + "/login");
    await p.locator("#login-submit").click();
    assert.equal(await p.locator("[aria-invalid=true]").count(), 2);
    checks.push("Empty login and focus");
    await p.locator("#identifier").fill(qaEmail);
    await p.locator("#password").fill("Emora-QA-Only-963!");
    const response = p.waitForResponse((r) =>
      r.url().endsWith("/api/auth/login"),
    );
    await p.locator("#login-submit").click();
    token = (await (await response).json()).token;
    await p.waitForURL("**/dashboard");
    await Promise.all([
      p.waitForResponse((r) => r.url().endsWith("/api/product/onboarding")),
      p.locator(".goal-onboarding-close").click(),
    ]);
    await p.locator("#workspace-command-trigger").click();
    const input = p.locator("#workspace-command-input");
    let finishOld;
    const oldGate = new Promise((r) => (finishOld = r));
    let oldStarted;
    const started = new Promise((r) => (oldStarted = r));
    await p.route("**/api/workspace/search?*", async (route) => {
      const old = route.request().url().includes("older");
      if (old) {
        oldStarted();
        await oldGate;
      }
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: [
              {
                path: "/journal",
                type: "journal",
                title: old ? "Stale result" : "Current result",
                excerpt: "Simulated result",
              },
            ],
          }),
        });
      } catch {}
    });
    await input.fill("older");
    await started;
    await input.fill("newer");
    await p.getByText("Current result", { exact: true }).waitFor();
    finishOld();
    await p.waitForTimeout(100);
    assert.equal(await p.getByText("Stale result", { exact: true }).count(), 0);
    checks.push("Simulated out-of-order search response ignored");
    await p.keyboard.press("Escape");
    await p.locator("#workspace-command-dialog").waitFor({ state: "hidden" });
    checks.push("Mobile search overflow and Escape");
    await p.unroute("**/api/workspace/search?*");
    let feedSeen = false;
    p.on("response", (r) => {
      if (r.url().includes("/posts")) feedSeen = true;
    });
    await p.goto(base + "/community");
    await p.waitForTimeout(700);
    assert.equal(feedSeen, true);
    checks.push("Community feed initializes");
    await p.goto(base + "/chat");
    await p.setViewportSize({ width: 390, height: 420 });
    await p.locator("#message-input").fill("Unsent viewport QA draft");
    const rect = await p.locator("#message-input").boundingBox();
    assert(
      rect.x >= 0 && rect.x + rect.width <= 390 && rect.y + rect.height < 420,
    );
    checks.push("Chat composer remains inside short viewport");
    await p.goto(base + "/login");
    await p.setViewportSize({ width: 320, height: 568 });
    await p.keyboard.press("Tab");
    assert(await p.evaluate(() => document.activeElement !== document.body));
    await p.locator("#password").fill("keyboard-test");
    await p.locator("#toggle-password").focus();
    await p.keyboard.press("Space");
    assert.equal(await p.locator("#password").getAttribute("type"), "text");
    checks.push("Keyboard navigation and visibility toggle");
    await p.route("https://accounts.google.com/**", (r) => r.abort());
    await p.goto(base + "/register");
    await p
      .getByText("Google sign-in is unavailable. Please use the form above.")
      .waitFor();
    await p.locator("#email").fill("");
    await p.locator("#register-submit").click();
    assert.equal(await p.locator("[aria-invalid=true]").count(), 3);
    checks.push("Blocked Google script preserves email form");
    await p.screenshot({
      path: output + "/register-error-320.png",
      fullPage: true,
    });
    console.log({ checks, errors });
    fs.writeFileSync(
      output + "/focused-results.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    assert.equal(errors.length, 0);
  } finally {
    if (token) {
      const r = await c.request.delete(base + "/api/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("Prior QA account cleanup", r.status());
    }
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
