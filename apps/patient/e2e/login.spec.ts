import { expect, test } from "@playwright/test";

test.describe("CareBridge portal selection", () => {
  test("patient sign-in page exposes Patient, Doctor, and Admin entry points", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await expect(page.getByRole("group", { name: "Sign in as", exact: true })).toBeVisible();

    await expect(page.getByText("Patient", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Doctor sign in/i }))
      .toHaveAttribute("href", new URL("/login", process.env.NEXT_PUBLIC_DOCTOR_APP_URL ?? "http://localhost:3001").toString());
    await expect(page.getByRole("link", { name: /Admin sign in/i }))
      .toHaveAttribute("href", new URL("/login", process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3002").toString());
  });

  test("CareBridge logo returns to the patient home page", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: "CareBridge home" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "CareBridge." })).toBeVisible();
  });
});
