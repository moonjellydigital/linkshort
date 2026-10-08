import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { click, createLinkViaApi, linkRow, uniqueSlug } from "./helpers.ts";

/** Fails on any WCAG 2.2 A/AA violation, listing rule ids and offending nodes. */
async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((v) => ({ rule: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) })),
  ).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${scheme} scheme)`, () => {
    test.use({ colorScheme: scheme });

    test("the dashboard with a new link has no violations", async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Address to shorten").fill("https://example.com/a11y");
      await page.getByLabel(/Custom short name/).fill(uniqueSlug("a11y"));
      await page.getByRole("button", { name: "Create short link" }).click();
      await expect(page.getByRole("region", { name: "Your short link" })).toBeVisible();
      await expectNoViolations(page);
    });

    test("form errors have no violations", async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Address to shorten").fill("not a url");
      await page.getByLabel(/Custom short name/).fill("x");
      await page.getByRole("button", { name: "Create short link" }).click();
      await expect(page.getByLabel("Address to shorten")).toHaveAttribute("aria-invalid", "true");
      await expectNoViolations(page);
    });

    test("the expanded daily breakdown has no violations", async ({ page, request }) => {
      const slug = uniqueSlug("a11yd");
      await createLinkViaApi(request, "https://example.com/daily", slug);
      await click(request, slug);
      await page.goto("/");
      await linkRow(page, slug).getByRole("button", { name: `Daily clicks for /${slug}` }).click();
      await expect(page.locator(`#daily-${slug}`).getByRole("listitem")).toHaveCount(7);
      await expectNoViolations(page);
    });
  });
}
