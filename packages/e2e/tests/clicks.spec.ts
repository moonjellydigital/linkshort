import { expect, test } from "@playwright/test";
import { click, createLinkViaApi, linkRow, uniqueSlug } from "./helpers.ts";

test.describe("following and counting short links", () => {
  test("a short link redirects with 302 and is never cached", async ({ request }) => {
    const slug = uniqueSlug("go");
    await createLinkViaApi(request, "https://example.com/destination?x=1", slug);

    const response = await request.get(`/${slug}`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("https://example.com/destination?x=1");
    expect(response.headers()["cache-control"]).toBe("no-store");
  });

  test("an unknown short link is a 404", async ({ request }) => {
    expect((await request.get(`/${uniqueSlug("missing")}`, { maxRedirects: 0 })).status()).toBe(404);
  });

  test("clicks appear in the list and the daily breakdown", async ({ page, request }) => {
    const slug = uniqueSlug("count");
    await createLinkViaApi(request, "https://example.com/counted", slug);
    await click(request, slug);
    await click(request, slug);

    await page.goto("/");
    const row = linkRow(page, slug);
    await expect(row.getByTestId("click-count")).toHaveText("2");
    await expect(row.locator("time")).toHaveText("just now");

    const toggle = row.getByRole("button", { name: `Daily clicks for /${slug}` });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(row.getByRole("button", { name: `Hide daily clicks for /${slug}` })).toHaveAttribute("aria-expanded", "true");

    const panel = page.locator(`#daily-${slug}`);
    await expect(panel.getByRole("listitem")).toHaveCount(7);
    // Sum across days rather than asserting "today", so a run that straddles
    // midnight UTC can't flake.
    const counts = await panel.locator(".daily-count").evaluateAll((els) =>
      els.map((el) => Number.parseInt(el.firstChild?.textContent ?? "0", 10)),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
  });

  test("Refresh picks up clicks that happened after the page loaded", async ({ page, request }) => {
    const slug = uniqueSlug("live");
    await createLinkViaApi(request, "https://example.com/live", slug);
    await page.goto("/");
    await expect(linkRow(page, slug).getByTestId("click-count")).toHaveText("0");

    await click(request, slug);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(linkRow(page, slug).getByTestId("click-count")).toHaveText("1");
    await expect(page.getByTestId("announcer")).toHaveText("Links refreshed");
  });

  test("Copy explains itself when the clipboard isn't available", async ({ page, request, context, baseURL }) => {
    const slug = uniqueSlug("copy");
    await createLinkViaApi(request, "https://example.com/copy", slug);
    // http://app:3000 is not a secure context, so the Clipboard API is absent.
    // Only localhost-style origins get a real clipboard.
    const host = new URL(baseURL ?? "").hostname;
    const secure = host === "localhost" || host === "127.0.0.1";
    if (secure) await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto("/");
    await linkRow(page, slug).getByRole("button", { name: `Copy short link /${slug}` }).click();
    await expect(page.getByTestId("announcer")).toHaveText(
      secure ? `Copied ${new URL(`/${slug}`, baseURL).toString()}` : /Copying isn't available on this connection/,
    );
  });
});
