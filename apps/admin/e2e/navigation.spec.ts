import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/**", route => route.fulfill(new URL(route.request().url()).pathname === "/v1/auth/me"
    ? { json: { user: { id: "admin-user", role: "ADMIN" } } }
    : { status: 503, json: { error: "Service temporarily unavailable" } }));
});

test("a direct operations link has Back and Dashboard even during a service failure", async ({ page }) => {
  await page.goto("/operations");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await expect(navigation.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("href", "/dashboard");
  await navigation.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Back restores an operations page with its query", async ({ page }) => {
  await page.goto("/operations?doctor=doctor-one#doctors");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await navigation.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await navigation.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/operations\?doctor=doctor-one#doctors$/);
});

test("login offers navigation on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await expect(navigation.getByRole("button", { name: "Back", exact: true })).toBeInViewport();
  await expect(navigation.getByRole("link", { name: "Dashboard", exact: true })).toBeInViewport();
  await expect(navigation.getByRole("link", { name: "Home", exact: true })).toBeInViewport();
});
