import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/**", route => route.fulfill(new URL(route.request().url()).pathname === "/v1/auth/me"
    ? { json: { user: { id: "doctor-user", role: "DOCTOR" } } }
    : { status: 503, json: { error: "Service temporarily unavailable" } }));
});

test("a direct workspace link has Back and Dashboard even during a service failure", async ({ page }) => {
  await page.goto("/profile");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await expect(navigation.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("href", "/dashboard");
  await navigation.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Back restores a workspace page with its query", async ({ page }) => {
  await page.goto("/profile?section=credentials");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await navigation.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await navigation.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?section=credentials$/);
});

test("login offers navigation on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await expect(navigation.getByRole("button", { name: "Back", exact: true })).toBeInViewport();
  await expect(navigation.getByRole("link", { name: "Dashboard", exact: true })).toBeInViewport();
  await expect(navigation.getByRole("link", { name: "Home", exact: true })).toBeInViewport();
});

test("Home keeps an authenticated workspace inside its own portal", async ({ page }) => {
  await page.goto("/dashboard");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});
