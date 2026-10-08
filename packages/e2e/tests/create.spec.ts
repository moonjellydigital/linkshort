import { expect, test } from "@playwright/test";
import { createLinkViaApi, linkRow, uniqueSlug } from "./helpers.ts";

test.describe("creating a short link", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("with a custom name shows the ticket, announces it and lists it", async ({ page, baseURL }) => {
    const slug = uniqueSlug("docs");
    await page.getByLabel("Address to shorten").fill("https://example.com/guide");
    await page.getByLabel(/Custom short name/).fill(slug);
    await page.getByRole("button", { name: "Create short link" }).click();

    const ticket = page.getByRole("region", { name: "Your short link" });
    await expect(ticket.getByRole("link")).toHaveText(`${new URL(baseURL ?? "").host}/${slug}`);
    await expect(ticket).toContainText("example.com/guide");
    await expect(page.getByTestId("announcer")).toHaveText(`Short link created: ${new URL(`/${slug}`, baseURL).toString()}`);

    const row = linkRow(page, slug);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("click-count")).toHaveText("0");
    await expect(row).toContainText("Never");

    // The form is cleared and ready for the next link.
    await expect(page.getByLabel("Address to shorten")).toHaveValue("");
    await expect(page.getByLabel("Address to shorten")).toBeFocused();
  });

  test("without a name generates a 7-character slug", async ({ page }) => {
    await page.getByLabel("Address to shorten").fill("https://example.com/generated");
    await page.getByRole("button", { name: "Create short link" }).click();
    await expect(page.getByRole("region", { name: "Your short link" }).getByRole("link")).toHaveText(/\/[0-9A-Za-z]{7}$/);
  });

  test("an invalid address is reported on the field and receives focus", async ({ page }) => {
    const input = page.getByLabel("Address to shorten");
    await input.fill("ftp://example.com");
    await page.getByRole("button", { name: "Create short link" }).click();

    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("Enter a full address starting with http:// or https://.");
    await expect(input).toBeFocused();
  });

  test("a name that's already taken is reported by the server on the name field", async ({ page, request }) => {
    const slug = uniqueSlug("taken");
    await createLinkViaApi(request, "https://example.com/first", slug);

    await page.getByLabel("Address to shorten").fill("https://example.com/second");
    const name = page.getByLabel(/Custom short name/);
    await name.fill(slug);
    await page.getByRole("button", { name: "Create short link" }).click();

    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAccessibleDescription(/already in use/);
    await expect(name).toBeFocused();
  });

  test("works with the keyboard alone", async ({ page }) => {
    const slug = uniqueSlug("kbd");
    await page.getByLabel("Address to shorten").focus();
    await page.keyboard.type("https://example.com/keyboard");
    await page.keyboard.press("Tab");
    await page.keyboard.type(slug);
    await page.keyboard.press("Enter");
    await expect(linkRow(page, slug)).toBeVisible();
  });
});
