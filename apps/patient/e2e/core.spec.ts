import { test, expect } from "./fixtures";

test.describe("Patient core navigation",()=>{
  test("can reach sign-in and cost comparison",async({page})=>{
    await page.goto("/");
    await page.getByRole("link",{name:"Sign in"}).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading",{name:/welcome back/i})).toBeVisible();
    await page.goto("/compare");
    await expect(page.getByRole("heading",{name:/compare costs with clear assumptions/i})).toBeVisible();
    await expect(page.getByText("Estimate only, not verified savings.", { exact: true })).toBeVisible();
  });
  test("medical documents page exposes secure upload",async({page})=>{
    await page.goto("/documents");
    await expect(page.getByRole("heading",{name:/bring the right records/i})).toBeVisible();
    await expect(page.getByRole("button",{name:/choose file/i})).toBeVisible();
  });
  test("notification page uses the patient notification surface",async({page})=>{
    await page.route("**/v1/auth/me", route=>route.fulfill({json:{user:{id:"patient-user",role:"PATIENT"}}}));
    await page.route("**/v1/notifications?*",async route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({unreadCount:1,notifications:[{id:"n1",type:"SYSTEM",title:"Test notification",body:"Your test update is ready.",status:"UNREAD",createdAt:new Date().toISOString()}]})}));
    await page.goto("/notifications");
    await expect(page.getByRole("heading",{name:/notifications/i})).toBeVisible();
    await expect(page.getByText("Test notification")).toBeVisible();
  });
  test("checkout without an appointment offers a recovery path", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Choose an appointment to continue." })).toBeVisible();
    await expect(page.getByRole("link", { name: "View my appointments" })).toHaveAttribute("href", "/dashboard");
  });
  test("email verification links prefill their one-time token", async ({ page }) => {
    await page.goto("/verify-email?token=test-one-time-token");
    await expect(page.getByLabel("Verification token", { exact: true })).toHaveValue("test-one-time-token");
  });
  test("document failures are actionable and do not claim an empty library", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Please sign in");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText("No medical documents uploaded yet.")).not.toBeVisible();
  });
  test("checkout shows unavailable providers without opening a broken payment URL", async ({ page }) => {
    await page.route("**/v1/auth/me", route=>route.fulfill({json:{user:{id:"patient-user",role:"PATIENT"}}}));
    const payment = { id: "payment-one", appointmentId: "appointment-one", amountMinor: 2500, currency: "USD", status: "REQUIRES_ACTION", provider: "demo", checkoutUrl: null };
    let intents = 0;
    await page.route("**/v1/payments/appointment-one", (route) => route.fulfill({ contentType: "application/json", body: "null" }));
    await page.route("**/v1/payments/intents", (route) => { intents++; return route.fulfill({ contentType: "application/json", body: JSON.stringify(payment) }); });
    await page.goto("/checkout/appointment-one");
    const continueButton = page.getByRole("button", { name: /continue to .*payment/i });
    await expect(continueButton).toBeVisible();
    expect(intents).toBe(0);
    await continueButton.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("No payment has been taken");
    await expect(continueButton).toBeEnabled();
    await expect(page).toHaveURL(/\/checkout\/appointment-one$/);
    expect(intents).toBe(1);
  });
});
