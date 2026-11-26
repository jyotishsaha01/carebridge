import { expect, test } from "./fixtures";

const patientSession = { user: { id: "patient-one", role: "PATIENT" } };

test("scrubs recovery credentials from history and clears them after a successful reset", async ({ page }) => {
  let submittedToken = "";
  const externalFonts: string[] = [];
  page.on("request", request => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url()); });
  await page.route("**/v1/auth/reset-password", route => {
    submittedToken = route.request().postDataJSON().token;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/reset-password#token=one-time-fragment-credential");
  await expect(page.getByLabel("Reset token", { exact: true })).toHaveValue("one-time-fragment-credential");
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill("Synthetic-Test-Password-2026!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Synthetic-Test-Password-2026!");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await expect(page.getByLabel("Reset token", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
  expect(submittedToken).toBe("one-time-fragment-credential");
  expect(externalFonts).toEqual([]);
});

test("scrubs legacy verification query tokens while preserving their form value", async ({ page }) => {
  await page.goto("/verify-email?token=one-time-query-credential");
  await expect(page.getByLabel("Verification token", { exact: true })).toHaveValue("one-time-query-credential");
  await expect(page).toHaveURL(/\/verify-email$/);
});

test("refuses a checkout redirect outside the configured provider origins", async ({ page }) => {
  await page.route("**/v1/auth/me", route => route.fulfill({ json: patientSession }));
  await page.route("**/v1/payments/appointment-one", route => route.fulfill({ json: { id: "payment-one", appointmentId: "appointment-one", amountMinor: 2500, currency: "USD", status: "REQUIRES_ACTION", provider: "test", checkoutUrl: "https://unapproved-payment.test/collect" } }));
  await page.goto("/checkout/appointment-one");
  await page.getByRole("button", { name: /continue to secure payment/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: "checkout destination is not approved" })).toBeVisible();
  await expect(page).toHaveURL(/\/checkout\/appointment-one$/);
});

test("clears private records after a session is revoked in another tab", async ({ page }) => {
  let valid = true;
  await page.route("**/v1/auth/me", route => route.fulfill(valid ? { json: patientSession } : { status: 401, json: { error: "Please sign in" } }));
  await page.route("**/v1/patient/records", route => route.fulfill({ json: { consultations: [{ id: "consultation-one", doctor: { name: "Private clinician", specialty: { name: "Private specialty" } }, status: "COMPLETED", createdAt: "2026-01-01T00:00:00Z" }], documents: [], carePlans: [] } }));
  await page.goto("/records");
  await expect(page.getByText("Private clinician")).toBeVisible();
  valid = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Private clinician")).toHaveCount(0);
});

test("removes the prior patient's document library when the active account changes", async ({ page }) => {
  let userId = "patient-one";
  await page.route("**/v1/auth/me", route => route.fulfill({ json: { user: { id: userId, role: "PATIENT" } } }));
  await page.route("**/v1/documents", route => route.fulfill({ json: [{ id: "document-one", originalFileName: "private-report.pdf", contentType: "application/pdf", sizeBytes: 100, createdAt: "2026-01-01T00:00:00Z" }] }));
  await page.goto("/documents");
  await expect(page.getByText("private-report.pdf")).toBeVisible();
  userId = "patient-two";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("private-report.pdf")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});

test("a stale patient draft is rejected under a changed cookie principal", async ({ page }) => {
  let userId = "patient-A";
  let appliedTo = "";
  let expectedUser = "";
  await page.route("**/v1/auth/me", route => route.fulfill({ json: { user: { id: userId, role: "PATIENT" } } }));
  await page.route("**/v1/auth/sessions", route => route.fulfill({ json: { sessions: [] } }));
  await page.route("**/v1/prototype/notification-preferences", route => route.fulfill({ json: [] }));
  await page.route("**/v1/patient/profile", route => {
    if (route.request().method() === "PATCH") {
      expectedUser = route.request().headers()["x-carebridge-expected-user"] ?? "";
      if (expectedUser && expectedUser !== userId) return route.fulfill({ status: 409, json: { error: "Your signed-in account changed. Reload or sign in again.", code: "ACCOUNT_CHANGED" } });
      appliedTo = userId;
    }
    return route.fulfill({ json: { firstName: "Private account A", country: "US", user: { email: "synthetic@example.test" } } });
  });
  await page.goto("/profile");
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Private account A");
  await page.getByLabel("First name", { exact: true }).fill("Unsaved account A draft");
  userId = "patient-B";
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(expectedUser).toBe("patient-A");
  expect(appliedTo).toBe("");
});
