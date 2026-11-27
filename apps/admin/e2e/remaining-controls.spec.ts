import { expect, test, type Page } from "@playwright/test";

const firstVersion = "2026-01-01T10:00:00.000Z";
const nextVersion = "2026-01-02T10:00:00.000Z";
const preferences = () => ({ CONSULTATION: true, PRESCRIPTION: true, FOLLOW_UP: true, CARE_PLAN: true, DOCUMENT: true, SUPPORT: true, SYSTEM: true });
const makeTicket = (id: string) => ({ id, userId: "patient-user", category: "Billing", message: `Question for ${id}`, status: "OPEN", priority: "NORMAL", slaDueAt: "2026-01-03T10:00:00.000Z", escalatedAt: null as string | null, createdAt: firstVersion, updatedAt: firstVersion, user: { id: "patient-user", email: "patient@example.test", role: "PATIENT" } });

async function base(page: Page) {
  await page.route("**/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: "admin-user", email: "admin@example.test", role: "ADMIN" } } });
    if (path === "/v1/notifications/stream") return route.fulfill({ contentType: "text/event-stream", body: "event: ready\ndata: {}\n\n" });
    if (path === "/v1/notification-preferences") return route.fulfill({ json: preferences() });
    return route.fulfill({ json: [] });
  });
}

async function support(page: Page, settings: { conflict?: boolean; failQueueAfterSave?: boolean } = {}) {
  await base(page);
  const records = [makeTicket("ticket-one"), makeTicket("ticket-two")];
  const patches: Record<string, unknown>[] = [];
  let hasSaved = false;
  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/admin/support/tickets") return settings.failQueueAfterSave && hasSaved ? route.fulfill({ status: 503, json: { error: "Queue refresh unavailable" } }) : route.fulfill({ json: records });
    const ticket = records.find((row) => path.includes(row.id));
    if (ticket && path === `/v1/admin/support/tickets/${ticket.id}`) {
      if (route.request().method() === "PATCH") {
        const input = route.request().postDataJSON(); patches.push(input);
        if (settings.conflict) { settings.conflict = false; ticket.priority = "HIGH"; ticket.updatedAt = nextVersion; return route.fulfill({ status: 409, json: { error: "This support request changed. Refresh latest request and try again." } }); }
        if (input.status) ticket.status = input.status;
        if (input.priority) ticket.priority = input.priority;
        if (input.escalated !== undefined) ticket.escalatedAt = input.escalated ? nextVersion : null;
        ticket.updatedAt = nextVersion; hasSaved = true;
      }
      return route.fulfill({ json: ticket });
    }
    if (ticket && path.endsWith("/messages")) {
      if (route.request().method() === "POST") { hasSaved = true; ticket.updatedAt = nextVersion; return route.fulfill({ status: 201, json: { id: "reply-confirmed", message: route.request().postDataJSON().message, createdAt: nextVersion, author: { id: "admin-user", role: "ADMIN" } } }); }
      return route.fulfill({ json: [] });
    }
    if (ticket && path.endsWith("/attachments")) return route.fulfill({ json: [{ id: "attachment-one", fileName: "evidence.pdf", contentType: "application/pdf", sizeBytes: 5, createdAt: firstVersion }] });
    if (ticket && path.endsWith("/content")) {
      expect(route.request().headers()["x-carebridge-expected-user"]).toBe("admin-user");
      return route.fulfill({ json: { attachment: { id: "attachment-one", fileName: "evidence.pdf", contentType: "application/pdf", sizeBytes: 5, createdAt: firstVersion }, contentBase64: "JVBERi0=" } });
    }
    return route.fallback();
  });
  return { patches };
}

test("support settings save only dirty fields and keep confirmed settings when queue refresh fails", async ({ page }) => {
  const { patches } = await support(page, { failQueueAfterSave: true });
  await page.goto("/support?ticket=ticket-one");
  const conversation = page.getByRole("region", { name: "Support conversation ticket-one" });
  await conversation.getByLabel("Status", { exact: true }).selectOption("IN_PROGRESS");
  await conversation.getByRole("button", { name: "Save support settings" }).click();
  await expect.poll(() => patches).toEqual([{ expectedUpdatedAt: firstVersion, status: "IN_PROGRESS" }]);
  await expect(conversation.getByText("Saved settings: IN_PROGRESS · NORMAL · Not escalated", { exact: true })).toBeVisible();
  await expect(conversation.getByRole("status")).toContainText("Settings saved");
  await expect(conversation.getByRole("button", { name: "Save support settings" })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "Queue refresh unavailable" })).toBeVisible();
});

test("support conflict retains draft and refresh uses the current version without overwriting another admin's priority", async ({ page }) => {
  const { patches } = await support(page, { conflict: true });
  await page.goto("/support?ticket=ticket-one");
  const conversation = page.getByRole("region", { name: "Support conversation ticket-one" });
  await conversation.getByLabel("Status", { exact: true }).selectOption("IN_PROGRESS");
  await conversation.getByRole("button", { name: "Save support settings" }).click();
  await expect(conversation.getByRole("alert")).toContainText("changed");
  await expect(conversation.getByLabel("Status", { exact: true })).toHaveValue("IN_PROGRESS");
  await conversation.getByRole("button", { name: "Refresh latest request" }).click();
  await expect(conversation.getByLabel("Priority", { exact: true })).toHaveValue("HIGH");
  await expect(conversation.getByLabel("Status", { exact: true })).toHaveValue("IN_PROGRESS");
  await conversation.getByRole("button", { name: "Save support settings" }).click();
  await expect.poll(() => patches[1]).toEqual({ expectedUpdatedAt: nextVersion, status: "IN_PROGRESS" });
  await expect(conversation.getByText("Saved settings: IN_PROGRESS · HIGH · Not escalated", { exact: true })).toBeVisible();
});

test("support retains per-ticket drafts and confirmed replies survive refresh failure", async ({ page }) => {
  const { patches } = await support(page, { failQueueAfterSave: true });
  await page.goto("/support");
  await page.getByRole("button", { name: "Open support request ticket-one", exact: true }).click();
  let conversation = page.getByRole("region", { name: "Support conversation ticket-one" });
  await conversation.getByLabel("Reply", { exact: true }).fill("A confirmed support response");
  await conversation.getByLabel("Status", { exact: true }).selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Open support request ticket-two", exact: true }).click();
  await page.getByRole("button", { name: "Open support request ticket-one", exact: true }).click();
  conversation = page.getByRole("region", { name: "Support conversation ticket-one" });
  await expect(conversation.getByLabel("Reply", { exact: true })).toHaveValue("A confirmed support response");
  await expect(conversation.getByLabel("Status", { exact: true })).toHaveValue("IN_PROGRESS");
  await conversation.getByRole("button", { name: "Send reply" }).click();
  await expect(conversation.getByRole("article")).toContainText("A confirmed support response");
  await expect(conversation.getByLabel("Reply", { exact: true })).toHaveValue("");
  await expect(conversation.getByRole("status")).toContainText("Reply sent");
  await expect(conversation.getByLabel("Status", { exact: true })).toHaveValue("IN_PROGRESS");
  await conversation.getByRole("button", { name: "Save support settings" }).click();
  await expect.poll(() => patches[0]).toEqual({ expectedUpdatedAt: nextVersion, status: "IN_PROGRESS" });
});

test("support downloads ticket attachments through the bound admin session", async ({ page }) => {
  await support(page);
  await page.goto("/support?ticket=ticket-one");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence.pdf", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("evidence.pdf");
});

test("notification mutation stays confirmed when the subsequent list reload fails", async ({ page }) => {
  await base(page);
  let saved = false;
  const item = { id: "notification-one", type: "SUPPORT", title: "Support updated", body: "A response is ready", status: "UNREAD", createdAt: firstVersion };
  await page.route("**/v1/notifications**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/notifications/stream") return route.fallback();
    if (path.endsWith("/read")) { saved = true; return route.fulfill({ json: { ...item, status: "READ" } }); }
    return saved ? route.fulfill({ status: 503, json: { error: "Inbox refresh unavailable" } }) : route.fulfill({ json: { notifications: [item], unreadCount: 1 } });
  });
  await page.goto("/notifications");
  const row = page.getByRole("article", { name: "Notification notification-one" });
  await row.getByRole("button", { name: "Mark read" }).click();
  await expect(row.getByText("READ", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Mark read" })).toHaveCount(0);
  await expect(page.getByLabel("0 unread notifications", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "change was saved" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Inbox refresh unavailable" })).toBeVisible();
});

test("notification preferences require Save, preserve a failed draft, and persist the confirmed preference", async ({ page }) => {
  await base(page);
  const values = preferences();
  let attempts = 0;
  await page.route("**/v1/notification-preferences**", (route) => {
    if (route.request().method() === "PATCH") { attempts++; if (attempts === 1) return route.fulfill({ status: 503, json: { error: "Preference save unavailable" } }); expect(route.request().postDataJSON()).toEqual({ enabled: false }); values.SUPPORT = false; }
    return route.fulfill({ json: values });
  });
  await page.route("**/v1/notifications?**", (route) => route.fulfill({ json: { notifications: [], unreadCount: 0 } }));
  await page.goto("/notifications");
  const section = page.getByRole("region", { name: "Notification preferences", exact: true });
  const checkbox = section.getByRole("checkbox", { name: /Support notifications/ });
  await checkbox.uncheck();
  expect(attempts).toBe(0);
  const save = section.getByRole("button", { name: "Save support notification preference", exact: true });
  await save.click();
  await expect(section.getByRole("alert")).toContainText("Preference save unavailable");
  await expect(checkbox).not.toBeChecked();
  await expect(section.getByText("Saved: On", { exact: true })).toHaveCount(7);
  await save.click();
  await expect(section.getByRole("status")).toHaveText("Support notifications disabled.");
  await expect(save).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Support notifications/ })).not.toBeChecked();
});

test("dashboard and support outages show errors without claiming empty queues", async ({ page }) => {
  await base(page);
  await page.route("**/v1/admin/**", (route) => route.fulfill({ status: 503, json: { error: "Admin service unavailable" } }));
  for (const path of ["/dashboard", "/support"]) {
    await page.goto(path);
    await expect(page.getByRole("alert").filter({ hasText: "Admin service unavailable" })).toBeVisible();
    await expect(page.getByText(/No (provider profiles|new patient care requests|open support requests|support requests match)/)).toHaveCount(0);
  }
});

test("credential approval remains confirmed if refreshing the provider fails", async ({ page }) => {
  await base(page);
  let approved = false;
  let allowRefresh = false;
  const provider = { id: "doctor-one", name: "Dr Review", slug: "review", location: "India", status: "PENDING", isVerified: false, isActive: false, pendingCredentials: 1, specialty: { name: "Cardiology" } };
  const credential = { id: "credential-one", doctorId: provider.id, type: "Medical license", licenseNumber: "TEST-123", jurisdiction: "Test", documentName: null, status: "PENDING", createdAt: firstVersion, reviewedAt: null as string | null };
  await page.route("**/v1/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/admin/credentials/credential-one") { approved = true; credential.status = "APPROVED"; credential.reviewedAt = nextVersion; return route.fulfill({ json: credential }); }
    if (path === "/v1/admin/doctors") return approved && !allowRefresh ? route.fulfill({ status: 503, json: { error: "Provider refresh unavailable" } }) : route.fulfill({ json: [{ ...provider, isVerified: approved, isActive: approved, status: approved ? "VERIFIED" : "PENDING" }] });
    if (path.endsWith("/credentials")) return route.fulfill({ json: [credential] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/operations?doctor=doctor-one#doctors");
  await page.getByRole("button", { name: "Approve license", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Credential credential-one saved as approved" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Credential saved. Latest provider details could not be refreshed." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve license", exact: true })).toHaveCount(0);
  allowRefresh = true;
  await page.getByRole("button", { name: "Refresh credentials", exact: true }).click();
  await expect(page.locator("#verified-doctors").getByRole("button", { name: /Dr Review/ })).toBeVisible();
});

test("open care queue deduplicates a request that moves stage between status reads", async ({ page }) => {
  await base(page);
  await page.route("**/v1/admin/analytics/overview", (route) => route.fulfill({ json: { patients: 1, doctors: 0, verifiedDoctors: 0, appointments: 0, consultations: 0, completedConsultations: 0, careRequests: 1, unreadNotifications: 0, recentAuditEvents: 0, consultationCompletionRate: 0 } }));
  await page.route("**/v1/admin/care-requests?**", (route) => {
    const status = new URL(route.request().url()).searchParams.get("status");
    const row = { id: "moving-request", patientId: "patient-one", type: "COORDINATION", title: "Moving request", description: null, country: null, targetDate: null, createdAt: firstVersion, patient: { id: "patient-one", firstName: "Asha", lastName: "Shah", country: "India" } };
    return route.fulfill({ json: status === "REQUESTED" ? [{ ...row, status, updatedAt: firstVersion }] : status === "REVIEWING" ? [{ ...row, status, updatedAt: nextVersion }] : [] });
  });
  await page.goto("/analytics?requestStatus=OPEN");
  const row = page.getByRole("article", { name: "Care request moving-request", exact: true });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Saved status: Reviewing");
  await expect(row.getByRole("combobox")).toHaveValue("REVIEWING");
});
