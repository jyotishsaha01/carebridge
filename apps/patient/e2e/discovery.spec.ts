import { test, expect } from "@playwright/test";

test.describe("Patient specialist discovery", () => {
  test("shows the CareBridge value proposition and specialist discovery", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /expert medical care/i })).toBeVisible();
    await expect(page.getByText("CareBridge Smart Cost", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: /find care that fits your needs/i })).toBeVisible();
    await expect(page.getByText("Dr. Anil Sharma")).toBeVisible();
  });

  test("filters specialists by specialty", async ({ page }) => {
    await page.goto("/");
    const select = page.getByLabel("Filter by specialty");
    await select.selectOption({ label: "Cardiology" });
    await expect(page.getByText("Dr. Meera Patel")).toBeVisible();
    await expect(page.getByText("Dr. Anil Sharma")).not.toBeVisible();
  });

  test("opens a specialist profile modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "View specialist" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/comparable us estimate/i)).toBeVisible();
  });
});
