import { expect, test } from "./fixtures";

const identity = { id: "care-tracker-patient", email: "care-tracker@example.test", role: "PATIENT" };
const initialRequest = { id: "care-request-synthetic-one", title: "Help with procedure planning", type: "PROCEDURE", status: "REQUESTED", description: "Discuss next steps", country: "US", createdAt: "2026-11-26T12:00:00.000Z", updatedAt: "2026-11-26T12:00:00.000Z" };

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/auth/me", route => route.fulfill({ json: { user: identity } }));
  await page.route("**/v1/patient/care-plans", route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    class TestEventSource extends EventTarget {
      private notify = () => this.dispatchEvent(new MessageEvent("notification", { data: "{}" }));
      constructor() { super(); window.addEventListener("care-test-notification", this.notify); }
      close() { window.removeEventListener("care-test-notification", this.notify); }
    }
    Object.defineProperty(window, "EventSource", { value: TestEventSource });
  });
});

test("saved coordinator stages refresh in the tracker without changing the patient's draft", async ({ page }) => {
  let saved = { ...initialRequest };
  let creates = 0;
  await page.route("**/v1/patient/care-requests", route => {
    if (route.request().method() === "POST") { creates++; return route.fulfill({ status: 201, json: saved }); }
    return route.fulfill({ json: [saved] });
  });
  await page.goto("/care");
  const request = page.getByRole("article", { name: `Care request: ${saved.title}` });
  await expect(request.getByText("Requested", { exact: true })).toBeVisible();
  await page.getByLabel("Request title", { exact: true }).fill("Draft for a different request");
  await page.getByLabel("Details", { exact: true }).fill("Keep these unsent notes");
  saved = { ...saved, status: "APPROVED", updatedAt: "2026-11-27T12:00:00.000Z" };
  await page.evaluate(() => window.dispatchEvent(new Event("care-test-notification")));
  await expect(request.getByText("Approved", { exact: true })).toBeVisible();
  await expect(request.getByText("The care team has approved the coordination request. Contact the team to confirm the next steps.")).toBeVisible();
  await expect(request.locator("time")).toHaveAttribute("datetime", saved.updatedAt);
  await expect(page.getByLabel("Request title", { exact: true })).toHaveValue("Draft for a different request");
  await expect(page.getByLabel("Details", { exact: true })).toHaveValue("Keep these unsent notes");

  saved = { ...saved, status: "SCHEDULED", updatedAt: "2026-11-27T13:00:00.000Z" };
  await page.getByRole("button", { name: "Refresh care hub", exact: true }).click();
  await expect(request.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(page.getByText("Appointment bookings and clinical care plans are managed separately.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Request title", { exact: true })).toHaveValue("Draft for a different request");
  expect(creates).toBe(0);
});

test("a request cannot be submitted twice while its first submission is pending", async ({ page }) => {
  let creates = 0;
  let saved: typeof initialRequest | null = null;
  let finishSubmission!: () => void;
  const submission = new Promise<void>(resolve => { finishSubmission = resolve; });
  await page.route("**/v1/patient/care-requests", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: saved ? [saved] : [] });
    creates++;
    await submission;
    saved = { ...initialRequest, ...route.request().postDataJSON() };
    await route.fulfill({ status: 201, json: saved });
  });
  await page.goto("/care");
  await expect(page.getByText("No care requests yet.", { exact: true })).toBeVisible();
  await page.getByLabel("Request title", { exact: true }).fill("Help with procedure planning");
  await page.getByRole("button", { name: "Start a care request", exact: false }).evaluate(button => {
    const form = (button as HTMLButtonElement).form!;
    form.requestSubmit(); form.requestSubmit();
  });
  await expect(page.getByRole("button", { name: "Submitting request…", exact: false })).toBeDisabled();
  await expect(page.getByLabel("Request title", { exact: true })).toBeDisabled();
  await expect.poll(() => creates).toBe(1);
  finishSubmission();
  await expect(page.getByText("Request submitted. Our care team can review it from here.")).toBeVisible();
  await expect(page.getByRole("article", { name: `Care request: ${initialRequest.title}` })).toHaveCount(1);
  await expect(page.getByLabel("Request title", { exact: true })).toHaveValue("");
  expect(creates).toBe(1);
});

test("the tracker recovers through notifications after its initial data request fails", async ({ page }) => {
  let available = false;
  await page.route("**/v1/patient/care-requests", route => route.fulfill(available
    ? { json: [{ ...initialRequest, status: "REVIEWING" }] }
    : { status: 503, json: { error: "The care tracker is temporarily unavailable." } }));
  await page.goto("/care");
  const trackerError = page.getByRole("alert").filter({ hasText: "The care tracker is temporarily unavailable." });
  await expect(trackerError).toBeVisible();
  await expect(page.getByText("No care requests yet.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Your care plan will appear here after your clinician or care team creates one.", { exact: true })).toHaveCount(0);
  await page.getByLabel("Request title", { exact: true }).fill("Keep this draft during recovery");
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event("care-test-notification")));
  await expect(page.getByRole("article", { name: `Care request: ${initialRequest.title}` }).getByText("Under review", { exact: true })).toBeVisible();
  await expect(trackerError).toHaveCount(0);
  await expect(page.getByLabel("Request title", { exact: true })).toHaveValue("Keep this draft during recovery");
});
