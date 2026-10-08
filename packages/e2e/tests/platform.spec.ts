import { expect, test } from "@playwright/test";

test.describe("service contract", () => {
  test("readiness and liveness endpoints respond", async ({ request }) => {
    expect((await request.get("/readyz")).status()).toBe(200);
    expect(await (await request.get("/healthz")).json()).toEqual({ status: "ok" });
  });

  test("the page loads with no requests leaving the app's origin", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "").origin;
    const foreign: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.protocol.startsWith("http") && url.origin !== origin) foreign.push(r.url());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "linkshort" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    // A sandbox network policy would block these, so the app must not depend on any.
    expect(foreign).toEqual([]);
  });
});
