import { test, expect } from "./fixtures";

test.describe("Patient specialist discovery", () => {
  test("shows the CareBridge value proposition and specialist discovery", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CareBridge." })).toBeVisible();
    await expect(page.getByRole("heading", { name: /know what care may cost/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /find care that fits your life/i })).toBeVisible();
    await expect(page.getByText("Dr. Anil Sharma")).toBeVisible();
  });

  test("filters specialists by specialty", async ({ page }) => {
    await page.goto("/");
    const select = page.getByLabel("Filter by specialty").first();
    await select.selectOption({ label: "Cardiology" });
    await expect(page.getByText("Dr. Meera Patel")).toBeVisible();
    await expect(page.getByText("Dr. Anil Sharma")).not.toBeVisible();
  });

  test("opens a specialist profile modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "View specialist" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/comparable us estimate/i)).toBeVisible();
  });

  test("keeps the specialist dialog keyboard accessible and restores focus", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "View specialist" }).first();
    await trigger.click();
    const close = page.getByRole("button", { name: "Close specialist details" });
    await expect(close).toBeFocused();
    await expect(page.getByRole("button", { name: "Refresh availability" })).toBeEnabled();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Refresh availability" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("recovers an expired session while reserving a consultation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "View specialist" }).first().click();
    await expect(page.getByText("Choose a consultation time")).toBeVisible();
    await page.locator(".slot-list button").first().click();
    await page.getByRole("button", { name: "Reserve a time" }).click();
    await expect(page.getByRole("link", { name: "Sign in to reserve a time" })).toBeVisible();
  });
});
