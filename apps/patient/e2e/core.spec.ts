import { test, expect } from "@playwright/test";

test.describe("Patient core navigation",()=>{
  test("can reach sign-in and cost comparison",async({page})=>{
    await page.goto("/");
    await page.getByRole("link",{name:"Sign in"}).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading",{name:/welcome back/i})).toBeVisible();
    await page.goto("/compare");
    await expect(page.getByRole("heading",{name:/see the difference before you choose/i})).toBeVisible();
    await expect(page.getByText(/illustrative.*benchmark/i)).toBeVisible();
  });
  test("medical documents page exposes secure upload",async({page})=>{
    await page.goto("/documents");
    await expect(page.getByRole("heading",{name:/bring the right records/i})).toBeVisible();
    await expect(page.getByRole("button",{name:/choose file/i})).toBeVisible();
  });
  test("notification page uses the patient notification surface",async({page})=>{
    await page.route("**/v1/notifications?*",async route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({unreadCount:1,notifications:[{id:"n1",type:"SYSTEM",title:"Test notification",body:"Your test update is ready.",status:"UNREAD",createdAt:new Date().toISOString()}]})}));
    await page.goto("/notifications");
    await expect(page.getByRole("heading",{name:/notifications/i})).toBeVisible();
    await expect(page.getByText("Test notification")).toBeVisible();
  });
});