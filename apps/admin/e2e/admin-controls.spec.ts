import { expect, test, type Page } from "@playwright/test";

const submitted = "2026-01-10T09:00:00.000Z";
const doctors = [
  { id: "doctor-review", name: "Dr Review", slug: "review", location: "India", status: "PENDING", isVerified: false, isActive: false, pendingCredentials: 1, specialty: { name: "Cardiology" } },
  { id: "doctor-verified", name: "Dr Verified", slug: "verified", location: "India", status: "VERIFIED", isVerified: true, isActive: true, pendingCredentials: 0, specialty: { name: "Cardiology" } },
];
const patient = { id: "patient-one", firstName: "Asha", lastName: "Shah", country: "India" };
const appointments = [
  { id: "appointment-completed", scheduledAt: submitted, status: "COMPLETED", durationMin: 30, patient, doctor: doctors[1], consultation: { id: "consultation-completed", status: "COMPLETED", startedAt: submitted, endedAt: submitted } },
  { id: "appointment-active", scheduledAt: submitted, status: "BOOKED", durationMin: 30, patient, doctor: doctors[1], consultation: { id: "consultation-active", status: "IN_PROGRESS", startedAt: submitted, endedAt: null } },
  { id: "appointment-unstarted", scheduledAt: submitted, status: "BOOKED", durationMin: 30, patient, doctor: doctors[1], consultation: null },
];
function request(id: string, status = "REQUESTED") {
  return { id, patientId: patient.id, type: "DIAGNOSTIC", status, title: "Same request title", description: `Details for ${id}`, country: "Singapore", targetDate: "2026-02-10T00:00:00.000Z", createdAt: submitted, updatedAt: submitted, patient };
}

async function mockAdmin(page: Page, options: { failSave?: number; failRefresh?: boolean } = {}) {
  let requests = [request("request-one"), request("request-two", "REVIEWING"), request("request-scheduled", "SCHEDULED"), request("request-completed", "COMPLETED")];
  let reads = 0;
  const patches: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: "admin-user", email: "admin@example.test", role: "ADMIN" } } });
    if (path === "/v1/admin/overview") return route.fulfill({ json: { patients: 1, doctors: 2, verifiedDoctors: 1, appointments: 3, openSessions: 1, pendingCareRequests: 2 } });
    if (path === "/v1/admin/analytics/overview") return route.fulfill({ json: { patients: 1, doctors: 2, verifiedDoctors: 1, appointments: 3, consultations: 2, completedConsultations: 1, careRequests: requests.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length, unreadNotifications: 7, recentAuditEvents: 1, consultationCompletionRate: 50 } });
    if (path === "/v1/admin/doctors") return route.fulfill({ json: doctors });
    if (path === "/v1/admin/patients") return route.fulfill({ json: [{ ...patient, createdAt: submitted, user: { email: "asha@example.test", isEmailVerified: true } }] });
    if (path === "/v1/admin/appointments") return route.fulfill({ json: appointments });
    if (path === "/v1/admin/sessions") return route.fulfill({ json: [{ id: "session-one", createdAt: submitted, lastSeenAt: submitted, expiresAt: "2027-01-01T00:00:00.000Z", user: { email: "asha@example.test", role: "PATIENT" } }] });
    if (path === "/v1/admin/audit-logs") return route.fulfill({ json: [
      { id: "audit-new", actorUserId: "admin-user", action: "CARE_REQUEST_UPDATED", resourceType: "CareRequest", resourceId: "request-one", outcome: "SUCCESS", metadata: null, createdAt: new Date().toISOString() },
      { id: "audit-old", actorUserId: null, action: "OLD_AUDIT_EVENT", resourceType: "Doctor", resourceId: "doctor-review", outcome: "SUCCESS", metadata: null, createdAt: "2000-01-01T00:00:00.000Z" },
    ] });
    if (path === "/v1/admin/care-requests") {
      reads++;
      if (options.failRefresh && reads > 1) return route.fulfill({ status: 503, json: { error: "Refresh temporarily unavailable" } });
      const status = url.searchParams.get("status");
      return route.fulfill({ json: status ? requests.filter((item) => item.status === status) : requests });
    }
    if (path.startsWith("/v1/admin/care-requests/") && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      patches.push({ path, body });
      if (options.failSave) {
        const status = options.failSave;
        options.failSave = undefined;
        return route.fulfill({ status, json: { error: status === 409 ? "This care request changed. Refresh latest before saving again." : "Status update temporarily unavailable" } });
      }
      const id = path.split("/").at(-1);
      const updated = { ...requests.find((item) => item.id === id)!, status: body.status, updatedAt: "2026-01-11T10:00:00.000Z" };
      requests = requests.map((item) => item.id === id ? updated : item);
      return route.fulfill({ json: updated });
    }
    return route.fulfill({ json: [] });
  });
  return { patches };
}

for (const [label, section, heading] of [
  ["Patients", "patients", "Patients"],
  ["Doctors", "doctors", "Provider license review"],
  ["Verified", "verified-doctors", "Verified doctors"],
  ["Appointments", "appointments", "Appointment operations"],
  ["Active sessions", "sessions", "Active account sessions"],
]) {
  test(`home ${label} metric opens its operational records`, async ({ page }) => {
    await mockAdmin(page);
    await page.goto("/");
    const card = page.getByRole("region", { name: "Operational metrics", exact: true }).getByRole("link", { name: new RegExp(`^${label} `) });
    await expect(card).toHaveAttribute("href", `/operations#${section}`);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/operations#${section}$`));
    await expect(page.locator(`#${section}`).getByRole("heading", { name: heading, exact: true })).toBeVisible();
  });
}

test("command center distinguishes total and verified doctors and opens filtered metric details", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/analytics");
  const metrics = page.getByRole("region", { name: "Command center metrics" });
  await expect(metrics.getByRole("link")).toHaveCount(10);
  await expect(metrics.getByRole("link", { name: /^Doctors / })).toContainText("2");
  await expect(metrics.getByRole("link", { name: /^Verified doctors / })).toContainText("1");
  await expect(metrics.getByRole("link", { name: /^Your unread alerts / })).toHaveAttribute("href", "/notifications");
  await metrics.getByRole("link", { name: /^Completed / }).click();
  await expect(page.getByRole("heading", { name: "Completed consultations", exact: true })).toBeVisible();
  await expect(page.getByText("Consultation ID: consultation-completed", { exact: false })).toBeVisible();
  await expect(page.getByText("Consultation ID: consultation-active", { exact: false })).toHaveCount(0);
  await expect(page.getByText(/This sample can omit older consultations/)).toBeVisible();
  await page.getByRole("navigation", { name: "Analytics detail views" }).getByRole("link", { name: "Consultations", exact: true }).click();
  await expect(page.getByText("Consultation ID: consultation-active", { exact: false })).toBeVisible();
  await page.getByRole("navigation", { name: "Analytics detail views" }).getByRole("link", { name: "Audit events/24h", exact: true }).click();
  await expect(page.getByText("CARE_REQUEST_UPDATED · SUCCESS", { exact: true })).toBeVisible();
  await expect(page.getByText("OLD_AUDIT_EVENT", { exact: false })).toHaveCount(0);
  await expect(page.getByText(/list can omit older records/)).toBeVisible();
});

test("open care request metric includes scheduled work and excludes completed requests", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/analytics");
  await page.getByRole("region", { name: "Command center metrics" }).getByRole("link", { name: /^Open care requests / }).click();
  await expect(page).toHaveURL(/requestStatus=OPEN#incoming-requests$/);
  await expect(page.getByRole("article", { name: "Care request request-scheduled", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Care request request-completed", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Care request filters" }).getByRole("link", { name: "Open requests", exact: true })).toHaveAttribute("aria-current", "page");
});

for (const failure of [503, 409]) {
  test(`care request save keeps the saved status and draft after ${failure}, then persists server success`, async ({ page }) => {
    const { patches } = await mockAdmin(page, { failSave: failure });
    await page.goto("/analytics");
    const row = page.getByRole("article", { name: "Care request request-one", exact: true });
    const otherRow = page.getByRole("article", { name: "Care request request-two", exact: true });
    const select = row.getByRole("combobox");
    const save = row.getByRole("button", { name: "Save status for Same request title (request-one)", exact: true });
    await expect(save).toBeDisabled();
    await expect(row).toContainText("Asha Shah");
    await expect(row).toContainText("Details for request-one");
    await select.selectOption("SCHEDULED");
    expect(patches).toEqual([]);
    await expect(row).toContainText("Saved status: Requested");
    await expect(row).toContainText("Unsaved change");
    await save.click();
    await expect(row.getByRole("alert")).toContainText(failure === 409 ? "Refresh latest" : "temporarily unavailable");
    await expect(row).toContainText("Saved status: Requested");
    await expect(select).toHaveValue("SCHEDULED");
    await expect(otherRow.getByRole("combobox")).toHaveValue("REVIEWING");
    expect(patches[0]).toEqual({ path: "/v1/admin/care-requests/request-one", body: { status: "SCHEDULED", expectedStatus: "REQUESTED", expectedUpdatedAt: submitted } });
    if (failure === 409) {
      await page.getByRole("button", { name: "Refresh latest", exact: true }).click();
      await expect(page.getByText("Loading requests…", { exact: true })).toHaveCount(0);
    }
    await save.click();
    await expect(row).toContainText("Saved status: Scheduled");
    await expect(row.getByRole("status")).toContainText("Saved: Scheduled");
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("article", { name: "Care request request-one", exact: true })).toContainText("Saved status: Scheduled");
  });
}

test("failed analytics refresh preserves unsaved care request edits", async ({ page }) => {
  const { patches } = await mockAdmin(page, { failRefresh: true });
  await page.goto("/analytics");
  const row = page.getByRole("article", { name: "Care request request-one", exact: true });
  await row.getByRole("combobox").selectOption("APPROVED");
  await page.getByRole("button", { name: "Refresh latest", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Refresh temporarily unavailable" })).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveValue("APPROVED");
  await expect(row).toContainText("Saved status: Requested");
  await expect(row.getByRole("button", { name: /^Save status for/ })).toBeEnabled();
  expect(patches).toEqual([]);
});

test("analytics service outages do not report empty queues or empty metric samples", async ({ page }) => {
  await page.route("**/v1/**", (route) => route.fulfill(new URL(route.request().url()).pathname === "/v1/auth/me"
    ? { json: { user: { id: "admin-user", email: "admin@example.test", role: "ADMIN" } } }
    : { status: 503, json: { error: "Analytics temporarily unavailable" } }));
  for (const path of ["/analytics", "/analytics?requestStatus=OPEN", "/analytics/details?view=completed", "/analytics/details?view=audits"]) {
    await page.goto(path);
    await expect(page.getByRole("alert").filter({ hasText: "Analytics temporarily unavailable" })).toBeVisible();
    await expect(page.getByText(/^No (open )?care requests\.$/)).toHaveCount(0);
    await expect(page.getByText(/^No .* (in this sample|in this appointment sample)\.$/)).toHaveCount(0);
    await expect(page.getByText(/^0 (matching audit events|completed consultations|consultations) shown\.$/)).toHaveCount(0);
  }
});

test("operations requires explicit Save and retains the draft on a conflict", async ({ page }) => {
  const { patches } = await mockAdmin(page, { failSave: 409 });
  await page.goto("/operations#patient-requests");
  const row = page.getByRole("article", { name: "Care request request-two", exact: true });
  await row.getByRole("combobox").selectOption("APPROVED");
  expect(patches).toEqual([]);
  await row.getByRole("button", { name: /^Save status for/ }).click();
  await expect(row.getByRole("alert")).toContainText("Refresh latest");
  await expect(row.getByRole("combobox")).toHaveValue("APPROVED");
  await expect(row).toContainText("Saved status: Reviewing");
  await expect(page.getByRole("article", { name: "Care request request-one", exact: true })).toContainText("Saved status: Requested");
});
