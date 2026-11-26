import { expect, test } from "@playwright/test";

for (const status of [403, 200]) {
  test(`preserves an existing session after a wrong-role sign-in response (${status})`, async ({ page, context }) => {
    const existingToken = "p".repeat(43);
    await context.addCookies([{ name: "carebridge_session", value: existingToken, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const requestedPaths: string[] = [];
    let loginBody: unknown;
    await page.route("**/v1/**", route => {
      const path = new URL(route.request().url()).pathname;
      requestedPaths.push(path);
      if (path === "/v1/auth/login") {
        loginBody = route.request().postDataJSON();
        return route.fulfill({ status, json: status === 403 ? { error: "This account does not have access to the admin workspace." } : { user: { id: "patient-user", role: "PATIENT" } } });
      }
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("patient@example.test");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page.getByRole("alert").filter({ hasText: status === 403 ? "does not have access" : "not registered as an administrator" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(loginBody).toEqual({ email: "patient@example.test", password: "synthetic-password", role: "ADMIN" });
    expect(requestedPaths).not.toContain("/v1/auth/logout");
    expect((await context.cookies()).find(cookie => cookie.name === "carebridge_session")?.value).toBe(existingToken);
  });
}

test("blocks the wrong role before requesting operations data", async ({ page }) => {
  let operationsRequested = false;
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path !== "/v1/auth/me") operationsRequested = true;
    return route.fulfill({ json: { user: { id: "patient-user", role: "PATIENT" } } });
  });
  await page.goto("/operations");
  await expect(page).toHaveURL(/\/login$/);
  expect(operationsRequested).toBe(false);
});

test("displays failures when an admin dashboard request fails", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(path === "/v1/auth/me" ? { json: { user: { id: "admin-user", role: "ADMIN" } } } : { status: 503, json: { error: "Operations temporarily unavailable" } });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("alert").filter({ hasText: "Operations temporarily unavailable" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("clears a previous provider's credentials when switching providers", async ({ page }) => {
  const providers = ["Alice", "Bob"].map((name, index) => ({ id: `doctor-${index}`, name, specialty: { name: "Cardiology" }, location: "Test", isVerified: false }));
  await page.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: "admin-user", role: "ADMIN" } } });
    if (path === "/v1/admin/doctors") return route.fulfill({ json: providers });
    if (path === "/v1/admin/doctors/doctor-0/credentials") return route.fulfill({ json: [{ id: "credential-alice", type: "Alice license", licenseNumber: "A-123", jurisdiction: "Test", status: "PENDING" }] });
    if (path === "/v1/admin/doctors/doctor-1/credentials") return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/operations");
  await page.getByRole("button", { name: /Alice/ }).click();
  await expect(page.getByText("Alice license")).toBeVisible();
  await page.getByRole("button", { name: /Bob/ }).click();
  await expect(page.getByText("Alice license")).toHaveCount(0);
  await expect(page.getByText("No credentials submitted by this doctor yet.")).toBeVisible();
});
