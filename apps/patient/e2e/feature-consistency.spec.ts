import { expect, test } from "./fixtures";

const identity = { id: "feature-patient", email: "feature-patient@example.test", role: "PATIENT" };
const preferences = { CONSULTATION: true, PRESCRIPTION: true, FOLLOW_UP: true, CARE_PLAN: true, DOCUMENT: true, SUPPORT: true, SYSTEM: false };
const profile = { firstName: "Feature", lastName: "Patient", country: "US", phone: "", emergencyContactName: "", emergencyContactPhone: "", user: { email: identity.email } };
const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const appointment = { id: "appointment-first", scheduledAt: future, durationMin: 30, status: "BOOKED", doctor: { id: "doctor-first", name: "Dr. First", slug: "dr-first", specialty: { name: "Cardiology" } }, consultation: null };

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/auth/me", route => route.fulfill({ json: { user: identity } }));
  await page.addInitScript(() => {
    class TestEventSource extends EventTarget {
      private notify = () => this.dispatchEvent(new MessageEvent("notification", { data: "{}" }));
      constructor() { super(); window.addEventListener("feature-test-notification", this.notify); }
      close() { window.removeEventListener("feature-test-notification", this.notify); }
    }
    Object.defineProperty(window, "EventSource", { value: TestEventSource });
  });
});

test("dashboard metrics show server totals and open paginated appointment records", async ({ page }) => {
  await page.route("**/v1/patient/dashboard", route => route.fulfill({ json: { appointments: [{ ...appointment, doctor: { name: "Dr. First", specialty: "Cardiology" } }], documents: [], consultations: [], appointmentCount: 21, documentCount: 37 } }));
  await page.route("**/v1/notifications?limit=1", route => route.fulfill({ json: { notifications: [], unreadCount: 0 } }));
  const offsets: string[] = [];
  await page.route("**/v1/patient/appointments?**", route => {
    const query = new URL(route.request().url()).searchParams; offsets.push(query.get("offset")!);
    return route.fulfill({ json: { appointments: [{ ...appointment, id: query.get("offset") === "20" ? "appointment-last" : appointment.id, doctor: { ...appointment.doctor, name: query.get("offset") === "20" ? "Dr. Last" : "Dr. First" } }], total: 21, limit: 20, offset: Number(query.get("offset")) } });
  });
  await page.goto("/dashboard");
  const overview = page.getByRole("region", { name: "Care overview" });
  await expect(overview.getByRole("link", { name: "Upcoming appointments", exact: true })).toContainText("21");
  await expect(overview.getByRole("link", { name: "Medical documents", exact: true })).toContainText("37");
  await overview.getByRole("link", { name: "Upcoming appointments", exact: true }).click();
  await expect(page).toHaveURL(/\/appointments\?view=upcoming$/);
  await expect(page.getByRole("heading", { name: "Dr. First", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dr. Last", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open appointment →", exact: true })).toHaveAttribute("href", "/appointments/appointment-last");
  expect(offsets).toContain("20");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("profile loads persisted disabled preferences and uses the confirmed saved profile", async ({ page }) => {
  let prefs = { ...preferences };
  let finishSave!: () => void;
  const save = new Promise<void>(resolve => { finishSave = resolve; });
  await page.route("**/v1/auth/sessions", route => route.fulfill({ json: { sessions: [] } }));
  await page.route("**/v1/prototype/notification-preferences", route => route.fulfill({ json: prefs }));
  await page.route("**/v1/prototype/notification-preferences/SYSTEM", route => { prefs = { ...prefs, SYSTEM: route.request().postDataJSON().enabled }; return route.fulfill({ json: prefs }); });
  await page.route("**/v1/patient/profile", async route => {
    if (route.request().method() === "PATCH") { await save; return route.fulfill({ json: { ...profile, firstName: "Canonical saved name" } }); }
    return route.fulfill({ json: profile });
  });
  await page.goto("/profile");
  const system = page.getByRole("checkbox", { name: "SYSTEM", exact: true });
  await expect(system).toBeEnabled(); await expect(system).not.toBeChecked();
  await system.click();
  await expect(page.getByRole("status").filter({ hasText: "SYSTEM notifications enabled." })).toBeVisible();
  await expect(system).toBeChecked();
  await page.getByLabel("First name", { exact: true }).fill("Draft name");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Phone", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Country", { exact: true })).toBeDisabled();
  finishSave();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Canonical saved name");
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  await page.reload(); await expect(system).toBeEnabled(); await expect(system).toBeChecked();
});

test("profile settings failures remain retryable without assuming enabled preferences or no sessions", async ({ page }) => {
  let available = false;
  await page.route("**/v1/patient/profile", route => route.fulfill({ json: profile }));
  await page.route("**/v1/auth/sessions", route => route.fulfill(available ? { json: { sessions: [] } } : { status: 503, json: { error: "Session list unavailable" } }));
  await page.route("**/v1/prototype/notification-preferences", route => route.fulfill(available ? { json: preferences } : { status: 503, json: { error: "Preferences unavailable" } }));
  await page.goto("/profile");
  const system = page.getByRole("checkbox", { name: "SYSTEM", exact: true });
  await expect(page.getByRole("alert").filter({ hasText: "Session list unavailable" })).toBeVisible();
  await expect(system).toBeDisabled();
  await expect(page.getByText("No session details available.", { exact: true })).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Retry preferences", exact: true }).click();
  await expect(system).toBeEnabled(); await expect(system).not.toBeChecked();
  await page.getByRole("button", { name: "Refresh sessions", exact: true }).click();
  await expect(page.getByText("No session details available.", { exact: true })).toBeVisible();
});

test("care plan progress requires Save, retains failed choices and renders the server-confirmed stage", async ({ page }) => {
  let task = { id: "task-one", title: "Track progress", status: "TODO", updatedAt: "2026-11-27T00:00:00.000Z" };
  const patches: Record<string, unknown>[] = [];
  let conflict = true;
  await page.route("**/v1/patient/care-plans", route => route.fulfill({ json: [{ id: "plan-one", title: "Recovery", status: "ACTIVE", tasks: [task] }] }));
  await page.route("**/v1/patient/care-plans/plan-one/tasks/task-one", route => {
    const body = route.request().postDataJSON(); patches.push(body);
    if (conflict) { conflict = false; return route.fulfill({ status: 409, json: { error: "Task changed. Refresh and try again." } }); }
    task = { ...task, status: body.status, updatedAt: "2026-11-27T01:00:00.000Z" }; return route.fulfill({ json: task });
  });
  await page.goto("/care-plan");
  const row = page.getByRole("article", { name: "Care task task-one", exact: true });
  await row.getByRole("combobox").selectOption("DONE"); expect(patches).toEqual([]);
  await row.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(row.getByRole("alert")).toContainText("Task changed");
  await expect(row.getByRole("combobox")).toHaveValue("DONE"); await expect(row).toContainText("Saved progress: To do");
  await row.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(row).toContainText("Saved progress: Done"); await expect(row.getByRole("status")).toContainText("Saved: Done");
  expect(patches[0]).toEqual({ status: "DONE", expectedStatus: "TODO", expectedUpdatedAt: "2026-11-27T00:00:00.000Z" });
  await page.reload(); await expect(row).toContainText("Saved progress: Done");
});

test("support refreshes the selected saved stage without losing per-ticket reply drafts", async ({ page }) => {
  const tickets = [
    { id: "ticket-a", category: "Technical issue", message: "First request", status: "OPEN", createdAt: future },
    { id: "ticket-b", category: "Account & privacy", message: "Second request", status: "OPEN", createdAt: future },
  ];
  let status = "OPEN";
  await page.route("**/v1/support/tickets", route => route.fulfill({ json: tickets.map(ticket => ({ ...ticket, status: ticket.id === "ticket-a" ? status : ticket.status })) }));
  await page.route("**/v1/support/tickets/*/messages", route => route.fulfill({ json: [] }));
  await page.goto("/support");
  await page.getByRole("button", { name: /Technical issue.*First request/ }).click();
  const reply = page.getByLabel("Reply", { exact: true }); await expect(reply).toBeEnabled(); await reply.fill("Keep my first draft");
  await page.getByRole("button", { name: /Account & privacy.*Second request/ }).click(); await expect(reply).toBeEnabled(); await reply.fill("Keep my second draft");
  await page.getByRole("button", { name: /Technical issue.*First request/ }).click(); await expect(reply).toHaveValue("Keep my first draft");
  status = "RESOLVED"; await page.evaluate(() => window.dispatchEvent(new Event("feature-test-notification")));
  await expect(page.getByText("Status: RESOLVED", { exact: true })).toBeVisible(); await expect(reply).toHaveValue("Keep my first draft");
});

test("a failed support submission is single-flight and retains its draft", async ({ page }) => {
  let sends = 0; let finish!: () => void; const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/v1/support/tickets", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    sends++; await pending; return route.fulfill({ status: 503, json: { error: "Support temporarily unavailable" } });
  });
  await page.goto("/support"); await expect(page.getByText("No support requests yet.", { exact: true })).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Preserve this unsent support request");
  await page.getByRole("button", { name: "Send request", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByLabel("Message", { exact: true })).toBeDisabled(); await expect.poll(() => sends).toBe(1); finish();
  await expect(page.getByRole("alert").filter({ hasText: "Support temporarily unavailable" })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Preserve this unsent support request"); expect(sends).toBe(1);
});

test("payment history retries an outage and links confirmed records to the correct appointment", async ({ page }) => {
  let available = false; let status = "SUCCEEDED";
  await page.route("**/v1/payments", route => route.fulfill(available ? { json: [{ id: "payment-one", appointmentId: "appointment-first", amountMinor: 2500, currency: "USD", status, provider: "demo", doctorName: "Dr. First", scheduledAt: future }] } : { status: 503, json: { error: "Payment history unavailable" } }));
  await page.goto("/payments"); await expect(page.getByRole("alert").filter({ hasText: "Payment history unavailable" })).toBeVisible();
  await expect(page.getByText(/^No payments yet\./)).toHaveCount(0); available = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("link", { name: "View appointment →", exact: true })).toHaveAttribute("href", "/appointments/appointment-first");
  await expect(page.getByRole("link", { name: "Continue payment →", exact: true })).toHaveCount(0);
  status = "REQUIRES_ACTION"; await page.getByRole("button", { name: "Refresh payments", exact: true }).click();
  await expect(page.getByRole("link", { name: "Continue payment →", exact: true })).toHaveAttribute("href", "/checkout/appointment-first");
});

test("intake retries failed loading, confirms a save and clears obsolete success after editing", async ({ page }) => {
  let available = false;
  await page.route("**/v1/appointments/appointment-first/intake", route => {
    if (route.request().method() === "PUT") return route.fulfill({ json: { ...route.request().postDataJSON(), status: "DRAFT" } });
    return route.fulfill(available ? { json: { reasonForVisit: "Existing concern", consentToConsult: false, status: "DRAFT" } } : { status: 503, json: { error: "Questionnaire unavailable" } });
  });
  await page.goto("/appointments/appointment-first/intake");
  await expect(page.getByRole("alert").filter({ hasText: "Questionnaire unavailable" })).toBeVisible(); available = true;
  await page.getByRole("button", { name: "Retry questionnaire", exact: true }).click();
  await page.getByLabel("Reason for visit", { exact: true }).fill("Updated concern");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved successfully." })).toBeVisible();
  await page.getByLabel("Reason for visit", { exact: true }).fill("New unsaved concern");
  await expect(page.getByText("Draft saved successfully.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Unsaved questionnaire changes", { exact: true })).toBeVisible();
});

test("care hub retains confirmed task progress when the follow-up refresh fails", async ({ page }) => {
  let refreshFails = false; let payload: Record<string, unknown> | null = null;
  const task = { id: "hub-task", title: "Track my recovery", status: "TODO", updatedAt: "2026-11-27T00:00:00.000Z" };
  await page.route("**/v1/patient/care-requests", route => route.fulfill({ json: [] }));
  await page.route("**/v1/patient/care-plans", route => route.fulfill(refreshFails ? { status: 503, json: { error: "Care refresh unavailable" } } : { json: [{ id: "hub-plan", title: "Recovery", status: "ACTIVE", tasks: [task] }] }));
  await page.route("**/v1/patient/care-plans/hub-plan/tasks/hub-task", route => {
    payload = route.request().postDataJSON(); refreshFails = true;
    return route.fulfill({ json: { ...task, status: "DONE", updatedAt: "2026-11-27T01:00:00.000Z" } });
  });
  await page.goto("/care"); const button = page.getByRole("button", { name: /Track my recovery/ });
  await expect(button).toHaveAttribute("aria-pressed", "false"); await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "Task progress saved: done." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Care refresh unavailable" })).toBeVisible();
  expect(payload).toEqual({ status: "DONE", expectedStatus: "TODO", expectedUpdatedAt: "2026-11-27T00:00:00.000Z" });
});

test("notification read success remains visible if refreshing the inbox subsequently fails", async ({ page }) => {
  let read = false;
  await page.route("**/v1/notifications?limit=100", route => route.fulfill(read ? { status: 503, json: { error: "Inbox refresh unavailable" } } : { json: { unreadCount: 1, notifications: [{ id: "notification-one", type: "SYSTEM", title: "Saved care update", body: "Your care request has been reviewed.", status: "UNREAD", createdAt: future }] } }));
  await page.route("**/v1/notifications/notification-one/read", route => { read = true; return route.fulfill({ json: { id: "notification-one", status: "READ" } }); });
  await page.goto("/notifications"); await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Notification marked as read." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Inbox refresh unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark read", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Notifications/ })).toContainText("0");
});
