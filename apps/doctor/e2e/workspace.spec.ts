import { expect, test } from "@playwright/test";

test("protects the clinical workspace before loading patient data", async ({ page }) => {
  let appointmentsRequested = false;
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/doctor/appointments") appointmentsRequested = true;
    return route.fulfill({ status: 401, json: { error: "Authentication required" } });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Clinical workspace access" })).toBeVisible();
  expect(appointmentsRequested).toBe(false);
  await expect(page.getByText("Demo Patient")).toHaveCount(0);
});

test("keeps unsaved clinical fields with their patient", async ({ page }) => {
  const rows = ["Alice", "Bob"].map((name, index) => ({
    id: `appointment-${index}`, scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED",
    patient: { firstName: name, lastName: "Test", country: "US" }, medicalIntake: null, documents: [],
    consultation: { id: `consultation-${index}`, status: "IN_PROGRESS", summary: null },
  }));
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/v1/auth/me" ? { user: { id: "doctor-user", role: "DOCTOR" } } : rows });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Alice Test" })).toBeVisible();
  await page.getByRole("textbox", { name: "Assessment", exact: true }).fill("Alice assessment");
  await page.getByRole("button", { name: /Bob Test/ }).click();
  await expect(page.getByRole("textbox", { name: "Assessment", exact: true })).toHaveValue("");
  await page.getByRole("textbox", { name: "Assessment", exact: true }).fill("Bob assessment");
  await page.getByRole("button", { name: /Alice Test/ }).click();
  await expect(page.getByRole("textbox", { name: "Assessment", exact: true })).toHaveValue("Alice assessment");
});

test("shows an appointment service failure without substituting demo records", async ({ page }) => {
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(path === "/v1/auth/me" ? { json: { user: { id: "doctor-user", role: "DOCTOR" } } } : { status: 503, json: { error: "Appointments temporarily unavailable" } });
  });
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Appointments temporarily unavailable" })).toBeVisible();
  await expect(page.getByText("Demo Patient")).toHaveCount(0);
});

test("preserves every medication when saving an existing prescription", async ({ page }) => {
  const prescription = { instructions: "Existing prescription instructions", items: [
    { medication: "Medication A", dose: "10 mg", frequency: "Daily", duration: "7 days", route: "Oral", instructions: "After food" },
    { medication: "Medication B", dose: "5 mg", frequency: "Twice daily", duration: "3 days", route: "Oral", instructions: null },
  ] };
  let savedItems: unknown;
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: "doctor-user", role: "DOCTOR" } } });
    if (path.endsWith("/prescription")) { savedItems = route.request().postDataJSON(); return route.fulfill({ json: prescription }); }
    return route.fulfill({ json: [{ id: "appointment-1", scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED", patient: { firstName: "Alice", lastName: "Test", country: "US" }, medicalIntake: null, documents: [], consultation: { id: "consultation-1", status: "IN_PROGRESS", summary: null, prescription } }] });
  });
  await page.goto("/");
  await expect(page.getByLabel("Medication 1", { exact: true })).toHaveValue("Medication A");
  await expect(page.getByLabel("Medication 2", { exact: true })).toHaveValue("Medication B");
  await page.getByRole("button", { name: "Save prescription", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Prescription saved");
  expect(savedItems).toEqual(prescription);
});

test("requires unsaved clinical edits to be saved before completing a consultation", async ({ page }) => {
  let completionRequested = false;
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: "doctor-user", role: "DOCTOR" } } });
    if (path.endsWith("/consultation")) { completionRequested = true; return route.fulfill({ json: { id: "consultation-1", status: "COMPLETED" } }); }
    return route.fulfill({ json: [{ id: "appointment-1", scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED", patient: { firstName: "Alice", lastName: "Test", country: "US" }, medicalIntake: null, documents: [], consultation: { id: "consultation-1", status: "IN_PROGRESS", summary: null } }] });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Assessment", exact: true }).fill("Unsaved assessment");
  await page.getByRole("button", { name: "Complete consultation", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Save or clear your clinical note" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Assessment", exact: true })).toHaveValue("Unsaved assessment");
  expect(completionRequested).toBe(false);
});

test("masks a focus recheck while preserving the same clinician's unsaved draft", async ({ page }) => {
  let checks = 0;
  let release = () => {};
  const pendingCheck = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") {
      checks++;
      if (checks > 1) await pendingCheck;
      return route.fulfill({ json: { user: { id: "doctor-user", role: "DOCTOR" } } });
    }
    return route.fulfill({ json: [{ id: "appointment-one", scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED", patient: { firstName: "Private", lastName: "Patient", country: "US" }, medicalIntake: null, documents: [], consultation: { id: "consultation-one", status: "IN_PROGRESS", summary: null } }] });
  });
  await page.goto("/");
  const assessment = page.getByRole("textbox", { name: "Assessment", exact: true });
  await assessment.fill("Unsaved private draft");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status").filter({ hasText: "Verifying secure access" })).toBeVisible();
  await expect(assessment).not.toBeVisible();
  release();
  await expect(assessment).toBeVisible();
  await expect(assessment).toHaveValue("Unsaved private draft");
});

test("clears clinical UI when a different clinician signs in in another tab", async ({ page }) => {
  let userId = "doctor-one";
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") return route.fulfill({ json: { user: { id: userId, role: "DOCTOR" } } });
    return route.fulfill({ json: [{ id: "appointment-one", scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED", patient: { firstName: "Private", lastName: "Patient", country: "US" }, medicalIntake: null, documents: [], consultation: { id: "consultation-one", status: "IN_PROGRESS", summary: null } }] });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Private Patient" })).toBeVisible();
  userId = "doctor-two";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Private Patient")).toHaveCount(0);
});

test("an outgoing document cannot finish while a new account check is still pending", async ({ page }) => {
  let checks = 0;
  let documentStarted = false;
  let releaseDocument!: () => void;
  let releaseCheck!: () => void;
  const documentPending = new Promise<void>(resolve => { releaseDocument = resolve; });
  const checkPending = new Promise<void>(resolve => { releaseCheck = resolve; });
  let downloads = 0;
  page.on("download", () => { downloads++; });
  await page.addInitScript(() => {
    const state = window as typeof window & { medicalBlobs: number; documentFetchesFinished: number };
    state.medicalBlobs = 0; state.documentFetchesFinished = 0;
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = object => { state.medicalBlobs++; return createObjectURL(object); };
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      try { return await fetch(input, init); }
      finally { if (String(input).includes("/v1/doctor/documents/")) state.documentFetchesFinished++; }
    };
  });
  await page.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") {
      checks++;
      if (checks > 1) await checkPending;
      return route.fulfill({ json: { user: { id: checks > 1 ? "doctor-B" : "doctor-A", role: "DOCTOR" } } });
    }
    if (path.includes("/documents/")) {
      documentStarted = true; await documentPending;
      await route.fulfill({ json: { contentBase64: btoa("%PDF-1.7\nprivate account-A report"), contentType: "application/pdf", originalFileName: "private-report.command" } }).catch(() => {});
      return;
    }
    return route.fulfill({ json: [{ id: "appointment-one", scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED", patient: { firstName: "Private", lastName: "Patient", country: "US" }, medicalIntake: null, documents: [{ id: "document-one", originalFileName: "private-report.command", sizeBytes: 100 }], consultation: { id: "consultation-one", status: "IN_PROGRESS", summary: null } }] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /private-report.command/ }).click();
  await expect.poll(() => documentStarted).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status").filter({ hasText: "Verifying secure access" })).toBeVisible();
  releaseDocument();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { documentFetchesFinished: number }).documentFetchesFinished)).toBe(1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => (window as typeof window & { medicalBlobs: number }).medicalBlobs)).toBe(0);
  expect(downloads).toBe(0);
  releaseCheck();
  await expect(page).toHaveURL(/\/login$/);
});

test("a newer focus check supersedes an older in-flight identity response", async ({ page }) => {
  let checks = 0;
  let releaseOldCheck!: () => void;
  const oldCheck = new Promise<void>(resolve => { releaseOldCheck = resolve; });
  await page.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") {
      const check = ++checks;
      if (check === 2) await oldCheck;
      await route.fulfill({ json: { user: { id: check >= 3 ? "doctor-B" : "doctor-A", role: "DOCTOR" } } }).catch(() => {});
      return;
    }
    return route.fulfill({ json: [{ id: "appointment-one", scheduledAt: "2030-01-01T10:00:00Z", status: "BOOKED", patient: { firstName: "Private", lastName: "Patient", country: "US" }, medicalIntake: null, documents: [], consultation: null }] });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Private Patient" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => checks).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  releaseOldCheck();
  await expect(page.getByText("Private Patient")).toHaveCount(0);
});
