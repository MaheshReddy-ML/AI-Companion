const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const output = require("path").resolve(
  process.env.EMORA_QA_OUTPUT || "tmp/ui-qa",
);
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const results = [];
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const route of ["login", "register", "forgot-password"])
      for (const width of [320, 360, 375, 390, 414, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("http://127.0.0.1:8000/" + route);
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          fields: [...document.querySelectorAll("input")].map((x) => ({
            id: x.id,
            width: x.getBoundingClientRect().width,
          })),
          submitY: document
            .querySelector("button[type=submit]")
            ?.getBoundingClientRect().bottom,
        }));
        results.push({ theme, route, width, ...result });
        if ([390, 1440].includes(width))
          await page.screenshot({
            path: `${output}/${route}-${theme}-${width}.png`,
            fullPage: true,
          });
      }
  }
  const a11y = [];
  for (const theme of ["light", "dark"])
    for (const route of ["login", "register"]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("http://127.0.0.1:8000/" + route);
      a11y.push({
        theme,
        route,
        violations: (await new AxeBuilder({ page }).analyze()).violations.map(
          (v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({
              html: n.html,
              summary: n.failureSummary,
            })),
          }),
        ),
      });
    }
  fs.writeFileSync(
    output + "/auth-results.json",
    JSON.stringify({ results, errors, a11y }, null, 2),
  );
  console.log(
    JSON.stringify(
      { overflows: results.filter((x) => x.overflow), errors, a11y },
      null,
      2,
    ),
  );
  await browser.close();
  if (
    results.some((x) => x.overflow) ||
    errors.length ||
    a11y.some((x) => x.violations.length)
  )
    process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
