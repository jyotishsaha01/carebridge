import { expect, test } from "./fixtures";

const identity = { id: "continuity-patient", email: "continuity@example.test", role: "PATIENT" };

test("login stays valid across features and dashboard return navigation", async ({ page }) => {
  let signedIn = false;
  await page.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/login") {
      expect(route.request().postDataJSON().role).toBe("PATIENT"); signedIn = true;
      return route.fulfill({ headers: { "set-cookie": "carebridge_session=synthetic-navigation-session; Path=/; HttpOnly; SameSite=Lax" }, json: { user: identity } });
    }
    if (!signedIn) return route.fallback();
    expect(route.request().headers().cookie).toContain("carebridge_session=synthetic-navigation-session");
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: identity } });
    if (path === "/v1/patient/dashboard") return route.fulfill({ json: { appointments: [], documents: [], consultations: [] } });
    if (path === "/v1/notifications") return route.fulfill({ json: { notifications: [], unreadCount: 0 } });
    if (path === "/v1/notifications/stream") return route.fulfill({ contentType: "text/event-stream", body: "event: ready\ndata: {}\n\n" });
    if (path === "/v1/patient/profile") return route.fulfill({ json: { firstName: "Continuity", country: "US", user: { email: identity.email } } });
    if (path === "/v1/auth/sessions") return route.fulfill({ json: { sessions: [] } });
    if (path === "/v1/patient/records") return route.fulfill({ json: { consultations: [], documents: [], carePlans: [] } });
    if (["/v1/documents", "/v1/patient/care-plans", "/v1/patient/care-requests", "/v1/prototype/notification-preferences"].includes(path)) return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-Patient-Password-2026!");
  await page.getByRole("button", { name: "Sign in securely", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good to see you." })).toBeVisible();
  await page.getByRole("navigation", { name: "Patient navigation" }).getByRole("link", { name: "Find specialists", exact: true }).click();
  const publicNavigation = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await expect(publicNavigation.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(publicNavigation.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await publicNavigation.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good to see you." })).toBeVisible();
  for (const [label, path, heading] of [
    ["Records", "/records", "Medical Records"], ["Care hub", "/care", "Care"],
    ["Profile", "/profile", "Your profile & settings"],
    ["Documents", "/documents", "Bring the right records to your consultation."],
    ["Notifications", "/notifications", "Notifications"],
  ]) {
    await page.getByRole("navigation", { name: "Patient navigation" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.getByRole("heading", { name: new RegExp(heading, "i") }).first()).toBeVisible();
    await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Good to see you." })).toBeVisible();
  }
});

test("a feature's 401 revalidates a healthy session and offers retry instead of signing out", async ({ page }) => {
  let checks = 0;
  await page.route("**/v1/auth/me", route => { checks++; return route.fulfill({ json: { user: identity } }); });
  await page.route("**/v1/patient/records", route => route.fulfill({ status: 401, json: { error: "This feature could not authorize the request." } }));
  await page.goto("/records");
  await expect(page.getByRole("heading", { name: "Your medical records couldn’t be loaded." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect.poll(() => checks).toBeGreaterThan(1);
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
});

test("a feature's 401 still clears private UI when the session probe confirms expiry", async ({ page }) => {
  let valid = true;
  await page.route("**/v1/auth/me", route => route.fulfill(valid ? { json: { user: identity } } : { status: 401, json: { error: "Session expired" } }));
  await page.route("**/v1/patient/records", route => { valid = false; return route.fulfill({ status: 401, json: { error: "Authentication required" } }); });
  await page.goto("/records");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByText("No completed consultation records yet.")).toHaveCount(0);
});

for (const [path, endpoint] of [["/documents", "**/v1/documents"], ["/notifications", "**/v1/notifications**"]]) {
  test(`${path} keeps a healthy session when its feature request fails`, async ({ page }) => {
    await page.route("**/v1/auth/me", route => route.fulfill({ json: { user: identity } }));
    await page.route(endpoint, route => route.fulfill({ status: 401, json: { error: "Feature authorization failed. Retry this request." } }));
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  });
}
