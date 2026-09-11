const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("fs");
const output = require("path").resolve(
  process.env.EMORA_QA_OUTPUT || "tmp/ui-qa",
);
fs.mkdirSync(output, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) =>
    errors.push({ url: p.url(), message: e.message, stack: e.stack }),
  );
  const checks = [];
  const base = "http://127.0.0.1:8000";
  let token;
  try {
    await p.goto(base + "/register");
    await p.locator("#register-submit").click();
    assert.equal(await p.locator("[aria-invalid=true]").count(), 3);
    assert.equal(
      await p.locator("#name").evaluate((x) => x === document.activeElement),
      true,
    );
    checks.push("Empty registration: field errors and focus");
    await p.locator("#name").fill("Emora UI QA");
    await p.locator("#email").fill("bad-email");
    await p.locator("#register-password").fill("short");
    await p.locator("#register-submit").click();
    assert.equal(await p.locator("[aria-invalid=true]").count(), 2);
    checks.push("Invalid email and short password");
    await p.locator("#register-toggle-password").click();
    assert.equal(
      await p.locator("#register-password").getAttribute("type"),
      "text",
    );
    await p.locator("#register-toggle-password").click();
    checks.push("Password visibility");
    const email = `emora-ui-qa-${Date.now()}@example.com`;
    const password = "Emora-QA-Only-963!";
    await p.locator("#email").fill(email);
    await p.locator("#register-password").fill(password);
    const registration = p.waitForResponse((r) =>
      r.url().endsWith("/api/auth/register"),
    );
    await p.locator("#register-submit").click();
    token = (await (await registration).json()).token;
    await p.waitForURL("**/login?registered=1*");
    assert.match(
      await p.locator("#login-status").innerText(),
      /Account created/,
    );
    checks.push("Real registration and login redirect");
    await p.locator("#password").fill("invalid-password");
    await p.locator("#login-submit").click();
    await p.locator("#login-status[data-tone=error]").waitFor();
    assert.match(
      await p.locator("#login-status").innerText(),
      /Invalid email or password/,
    );
    checks.push("Real invalid credentials");
    await p.locator("#password").fill(password);
    const responsePromise = p.waitForResponse((r) =>
      r.url().endsWith("/api/auth/login"),
    );
    await p.locator("#login-submit").click();
    token = (await (await responsePromise).json()).token;
    await p.waitForURL("**/dashboard");
    checks.push("Real login");
    await Promise.all([
      p.waitForResponse((r) => r.url().endsWith("/api/product/onboarding")),
      p.locator(".goal-onboarding-close").click(),
    ]);
    checks.push("First-run guide dismissal");
    const routes = [
      "dashboard",
      "chat",
      "sessions",
      "insights",
      "journal",
      "goals",
      "research",
      "community",
      "together",
      "notifications",
      "profile",
      "payment",
      "focus-together",
      "help",
      "trust",
      "status",
      "changelog",
    ];
    const layouts = [];
    for (const width of [320, 390, 768, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await p.goto(base + "/" + route);
        await p.evaluate(() => document.fonts.ready);
        await p.locator("main").first().waitFor();
        layouts.push({
          route,
          width,
          ...(await p.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            offenders: [...document.querySelectorAll("main *")]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return (
                  r.width > 0 &&
                  r.right > innerWidth + 2 &&
                  getComputedStyle(e).position !== "fixed"
                );
              })
              .slice(0, 6)
              .map((e) => ({ tag: e.tagName, cls: e.className })),
          }))),
        });
        if (
          [390, 1440].includes(width) &&
          ["dashboard", "chat", "profile", "together", "payment"].includes(
            route,
          )
        )
          await p.screenshot({
            path: `${output}/${route}-${width}.png`,
            fullPage: true,
          });
      }
    }
    checks.push("17 major routes at 4 widths");
    fs.writeFileSync(
      output + "/workspace-results.json",
      JSON.stringify(layouts, null, 2),
    );
    await p.goto(base + "/dashboard");
    await p.locator("#workspace-command-trigger").click();
    await p.locator("#workspace-command-input").fill("qa-no-matching-record");
    await p.screenshot({ path: output + "/search-dialog.png" });
    await p.keyboard.press("Escape");
    await p.locator("#workspace-command-dialog").waitFor({ state: "hidden" });
    assert.equal(
      await p.locator("#workspace-command-dialog").evaluate((e) => e.open),
      false,
    );
    checks.push("Search dialog and Escape");
    await p.locator("[data-logout]").first().click();
    await p.waitForURL("**/login");
    checks.push("Real logout");
    // Simulated delayed response checks loading and duplicate-submission protection.
    await p.route("**/api/auth/login", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Service temporarily unavailable. Try again.",
        }),
      });
    });
    await p.locator("#identifier").fill(email);
    await p.locator("#password").fill(password);
    await p.locator("#login-submit").click();
    assert.equal(await p.locator("#login-submit").isDisabled(), true);
    await p.locator("#login-status").waitFor();
    assert.equal(await p.locator("#login-submit").isEnabled(), true);
    checks.push("Simulated slow/service-failure recovery");
    await p.unroute("**/api/auth/login");
    await p.goto(base + "/login?error=Failure%20100%25");
    assert.match(await p.locator("#login-status").innerText(), /100%/);
    checks.push("Percent-containing callback error");
    const login = await ctx.request.post(base + "/api/auth/login", {
      data: { email, password },
    });
    token = (await login.json()).token;
    console.log(
      JSON.stringify(
        { checks, errors, overflow: layouts.filter((x) => x.overflow) },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      output + "/flow-results.json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    assert.equal(errors.length, 0);
    assert.equal(layouts.filter((x) => x.overflow).length, 0);
  } finally {
    if (token) {
      const result = await ctx.request.delete(base + "/api/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("Disposable QA account cleanup:", result.status());
    }
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
