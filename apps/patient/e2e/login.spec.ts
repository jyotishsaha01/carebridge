import { expect, test } from "@playwright/test";

test.describe("CareBridge portal selection", () => {
  test("patient sign-in page exposes Patient, Doctor, and Admin entry points", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await expect(page.getByText("SIGN IN AS")).toBeVisible();

    await expect(page.getByText("Patient", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Doctor.*Doctor sign in/i }))
      .toHaveAttribute("href", "http://localhost:3001/login");
    await expect(page.getByRole("link", { name: /Admin.*Admin sign in/i }))
      .toHaveAttribute("href", "http://localhost:3002/login");
  });

  test("CareBridge logo returns to the patient home page", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: "CareBridge home" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: /Expert medical care,/i })).toBeVisible();
  });
});
