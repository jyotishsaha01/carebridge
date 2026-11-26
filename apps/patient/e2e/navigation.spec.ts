import { test, expect } from "./fixtures";

test("Back on a directly opened public page returns home", async ({ page }) => {
  await page.goto("/compare");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await expect(navigation.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  await navigation.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("Back follows account recovery and then provides a way home", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  const back = page.getByRole("navigation", { name: "Page navigation", exact: true }).getByRole("button", { name: "Back", exact: true });
  await back.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL("/");
});

test("Back restores the previous page including its query when a workspace fails to load", async ({ page }) => {
  await page.route("**/v1/**", route => route.fulfill(new URL(route.request().url()).pathname === "/v1/auth/me"
    ? { json: { user: { id: "patient-user", role: "PATIENT" } } }
    : { status: 503, json: { error: "Service temporarily unavailable" } }));
  await page.goto("/compare?source=care-plan#scenario-title");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  await navigation.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await navigation.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/compare\?source=care-plan#scenario-title$/);
});

test("page navigation stays accessible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/reset-password");
  const navigation = page.getByRole("navigation", { name: "Page navigation", exact: true });
  for (const name of ["Home", "Dashboard"]) await expect(navigation.getByRole("link", { name, exact: true })).toBeInViewport();
  const back = navigation.getByRole("button", { name: "Back", exact: true });
  await expect(back).toBeInViewport();
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
});

test("Back never restores scrubbed verification credentials", async ({ page }) => {
  await page.goto("/verify-email?token=synthetic-private-navigation-token");
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole("link", { name: "Back to sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Page navigation", exact: true }).getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByLabel("Verification token", { exact: true })).toHaveValue("");
});
