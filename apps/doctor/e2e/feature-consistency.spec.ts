import {expect,test,type Page} from "@playwright/test";

const identity={id:"doctor-user",email:"doctor@example.test",role:"DOCTOR"};
const profile={id:"doctor-one",name:"Dr. Synthetic",status:"VERIFIED",isVerified:true,bio:"Saved biography",location:"Saved city",experienceYears:10,consultationPriceUsd:25,expertise:["Cardiology"],specialty:{name:"Cardiology"}};
const preferenceTypes=["CONSULTATION","PRESCRIPTION","FOLLOW_UP","CARE_PLAN","DOCUMENT","SUPPORT","SYSTEM"];
const defaultPreferences=Object.fromEntries(preferenceTypes.map(type=>[type,true]));
function appointment(id:string,status="BOOKED",consultationStatus:string|null=null){return {id,scheduledAt:"2035-01-01T12:00:00Z",status,patient:{firstName:id,lastName:"Patient",country:"US"},medicalIntake:null,documents:[],consultation:consultationStatus?{id:`consultation-${id}`,status:consultationStatus,summary:null,notes:[]}:null};}
async function setup(page:Page){
 await page.route("**/v1/**",route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==="/v1/auth/me"?{user:identity}:path==="/v1/doctor/me"?profile:path==="/v1/notification-preferences"?defaultPreferences:path==="/v1/notifications"?{notifications:[],unreadCount:0}:[]});});
 await page.addInitScript(()=>{
  class TestEventSource extends EventTarget{
   private notify=()=>this.dispatchEvent(new MessageEvent("notification",{data:"{}"}));
   constructor(){super();window.addEventListener("doctor-test-notification",this.notify);}
   close(){window.removeEventListener("doctor-test-notification",this.notify);}
  }
  Object.defineProperty(window,"EventSource",{value:TestEventSource});
 });
}

test("doctor metrics open the matching queue filter and exclude cancelled clinical work",async({page})=>{
 await setup(page);
 await page.route("**/v1/doctor/appointments",route=>route.fulfill({json:[appointment("Upcoming"),appointment("Working","BOOKED","IN_PROGRESS"),appointment("Finished","COMPLETED","COMPLETED"),appointment("Cancelled","CANCELLED","IN_PROGRESS")]}));
 await page.goto("/dashboard");
 await page.getByRole("button",{name:"Show in progress appointments (1)",exact:true}).click();
 await expect(page.getByRole("combobox",{name:"Filter appointments"})).toHaveValue("IN_PROGRESS");
 const queue=page.locator("#appointment-queue");
 await expect(queue.getByText("Working Patient",{exact:true})).toBeVisible();
 await expect(queue.getByText("Cancelled Patient",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Show completed appointments (1)",exact:true}).click();
 await expect(queue.getByText("Finished Patient",{exact:true})).toBeVisible();
 await expect(queue.getByText("Working Patient",{exact:true})).toHaveCount(0);
 await page.getByRole("region",{name:"Doctor performance overview"}).getByRole("link",{name:/Open slots/}).click();
 await expect(page).toHaveURL(/\/operations\?status=AVAILABLE#scheduled-slots$/);
 await expect(page.getByRole("combobox",{name:"Filter availability"})).toHaveValue("AVAILABLE");
});

test("doctor dashboard and availability failures never claim empty records",async({page})=>{
 await setup(page);
 await page.route("**/v1/doctor/appointments",route=>route.fulfill({status:503,json:{error:"Queue unavailable"}}));
 await page.goto("/dashboard");
 await expect(page.getByRole("alert").filter({hasText:"Queue unavailable"})).toBeVisible();
 await expect(page.getByText("No appointments found",{exact:true})).toHaveCount(0);
 await page.route("**/v1/doctor/availability{,?*}",route=>route.fulfill({status:503,json:{error:"Availability unavailable"}}));
 await page.goto("/operations");
 await expect(page.getByRole("alert").filter({hasText:"Availability unavailable"})).toBeVisible();
 await expect(page.getByText("No availability yet. Add your first consultation slot above.")).toHaveCount(0);
});

test("availability creation uses the saved slot and reports success without a second read",async({page})=>{
 await setup(page);let reads=0;let creates=0;
 await page.route("**/v1/doctor/availability{,?*}",route=>{
  if(route.request().method()==="POST"){creates++;return route.fulfill({status:201,json:{id:"saved-slot",...route.request().postDataJSON(),status:"AVAILABLE"}});}
  reads++;return route.fulfill(reads===1?{json:[]}:{status:503,json:{error:"Temporary read outage"}});
 });
 await page.goto("/operations");
 await expect(page.getByRole("button",{name:"Add consultation slot"})).toBeEnabled();
 await page.getByLabel("Start date and time").fill("2035-01-01T12:00");
 await page.getByRole("button",{name:"Add consultation slot"}).click();
 await expect(page.getByRole("status").filter({hasText:"Availability added"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Remove slot saved-slot",exact:true})).toBeVisible();
 expect(creates).toBe(1);expect(reads).toBe(1);
 await page.getByRole("button",{name:"Refresh availability",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"Temporary read outage"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Remove slot saved-slot",exact:true})).toBeVisible();
});

test("profile refresh preserves edits and save reconciles the confirmed server values",async({page})=>{
 await setup(page);let current={...profile};let writes=0;let fail=true;
 await page.route("**/v1/doctor/me",route=>route.fulfill({json:current}));
 await page.route("**/v1/doctor/me/profile",route=>{writes++;if(fail)return route.fulfill({status:503,json:{error:"Profile save unavailable"}});current={...current,...route.request().postDataJSON(),location:"Normalized city"};return route.fulfill({json:current});});
 await page.goto("/profile");
 await page.getByRole("textbox",{name:"Location",exact:true}).fill("Unsaved city");
 current={...current,bio:"Latest saved biography"};
 await page.getByRole("button",{name:"Refresh profile and credentials",exact:true}).click();
 await expect(page.getByRole("textbox",{name:"Biography",exact:true})).toHaveValue("Latest saved biography");
 await expect(page.getByRole("textbox",{name:"Location",exact:true})).toHaveValue("Unsaved city");
 expect(writes).toBe(0);
 await page.getByRole("button",{name:"Save profile",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"Profile save unavailable"})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"Location",exact:true})).toHaveValue("Unsaved city");
 fail=false;await page.getByRole("button",{name:"Save profile",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Profile saved"})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"Location",exact:true})).toHaveValue("Normalized city");
 await expect(page.getByRole("button",{name:"Save profile",exact:true})).toBeDisabled();
});

test("notification recovery preserves unsaved preferences until explicit saving succeeds",async({page})=>{
 await setup(page);let available=false;let failSave=true;let writes=0;
 let saved={...defaultPreferences};
 const notification={id:"notification-one",type:"SYSTEM",title:"Saved clinical update",body:"Your update is ready",status:"UNREAD",createdAt:"2026-11-27T10:00:00Z"};
 await page.route("**/v1/notifications?*",route=>route.fulfill(available?{json:{notifications:[notification],unreadCount:1}}:{status:503,json:{error:"Inbox unavailable"}}));
 await page.route("**/v1/notification-preferences",route=>route.fulfill({json:saved}));
 await page.route("**/v1/notification-preferences/SYSTEM",route=>{writes++;if(failSave)return route.fulfill({status:503,json:{error:"Preference save unavailable"}});saved={...saved,SYSTEM:route.request().postDataJSON().enabled};return route.fulfill({json:saved});});
 await page.goto("/notifications");
 await expect(page.getByRole("alert").filter({hasText:"Inbox unavailable"})).toBeVisible();
 await expect(page.getByText("You’re all caught up. New notifications will appear here.")).toHaveCount(0);
 await page.getByRole("checkbox",{name:"System updates",exact:true}).uncheck();
 available=true;await page.evaluate(()=>window.dispatchEvent(new Event("doctor-test-notification")));
 await expect(page.getByRole("heading",{name:notification.title,exact:true})).toBeVisible();
 await expect(page.getByRole("checkbox",{name:"System updates",exact:true})).not.toBeChecked();
 expect(writes).toBe(0);
 await page.getByRole("button",{name:"Save system preference",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"Preference save unavailable"})).toBeVisible();
 await expect(page.getByRole("checkbox",{name:"System updates",exact:true})).not.toBeChecked();
 failSave=false;await page.getByRole("button",{name:"Save system preference",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"System preference saved: disabled"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Save system preference",exact:true})).toBeDisabled();
 expect(writes).toBe(2);
});

test("confirmed notification reads remain visible when the inbox refresh fails",async({page})=>{
 await setup(page);let read=false;
 const notification={id:"notification-one",type:"SYSTEM",title:"Confirmed doctor update",body:"Synthetic update",status:"UNREAD",createdAt:"2026-11-27T10:00:00Z"};
 await page.route("**/v1/notifications?*",route=>route.fulfill(read?{status:503,json:{error:"Inbox refresh unavailable"}}:{json:{notifications:[notification],unreadCount:1}}));
 await page.route("**/v1/notifications/notification-one/read",route=>{read=true;return route.fulfill({json:{...notification,status:"READ"}});});
 await page.goto("/notifications");
 await page.getByRole("button",{name:"Mark read",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Notification marked read."})).toBeVisible();
 await expect(page.getByRole("alert").filter({hasText:"Changes saved. Inbox refresh failed: Inbox refresh unavailable"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Mark read",exact:true})).toHaveCount(0);
 await expect(page.getByText("READ",{exact:true})).toBeVisible();
 await expect(page.getByLabel("0 unread notifications",{exact:true})).toBeVisible();
});

test("refresh saved clinical record updates unchanged fields and retains unsaved clinical edits",async({page})=>{
 await setup(page);
 const row={...appointment("Clinical","BOOKED","IN_PROGRESS"),consultation:{id:"consultation-Clinical",status:"IN_PROGRESS",summary:null,notes:[{id:"note-one",assessment:"Saved assessment",findings:"Old finding",recommendations:null,createdAt:"2026-11-27T10:00:00Z"}]}};
 let rows=[row];
 await page.route("**/v1/doctor/appointments",route=>route.fulfill({json:rows}));
 await page.route("**/v1/doctor/appointments/Clinical/clinical-record",route=>route.fulfill({json:{consultation:row.consultation,notes:[{...row.consultation.notes[0],assessment:"External assessment",findings:"Latest finding"}],prescription:null,followUps:[]}}));
 await page.goto("/");
 await page.getByRole("textbox",{name:"Assessment",exact:true}).fill("Unsaved assessment");
 await page.getByRole("button",{name:"Refresh saved record",exact:true}).click();
 await expect(page.getByRole("textbox",{name:"Findings",exact:true})).toHaveValue("Latest finding");
 await expect(page.getByRole("textbox",{name:"Assessment",exact:true})).toHaveValue("Unsaved assessment");
 rows=[{...row,consultation:{...row.consultation,notes:[{...row.consultation.notes[0],assessment:"Queue assessment",findings:"Queue latest finding"}]}}];
 await page.getByRole("button",{name:"Refresh appointment queue",exact:true}).click();
 await expect(page.getByRole("textbox",{name:"Findings",exact:true})).toHaveValue("Queue latest finding");
 await expect(page.getByRole("textbox",{name:"Assessment",exact:true})).toHaveValue("Unsaved assessment");
 await page.getByRole("button",{name:"Complete consultation",exact:true}).click();
 await expect(page.getByRole("alert").filter({hasText:"Save or clear your clinical note"})).toBeVisible();
});

test("a saved cancellation remains clear when the availability refresh fails",async({page})=>{
 await setup(page);let availabilityReads=0;
 await page.route("**/v1/doctor/appointments",route=>route.fulfill({json:[appointment("Working","BOOKED","IN_PROGRESS")]}));
 await page.route("**/v1/doctor/availability{,?*}",route=>{availabilityReads++;return route.fulfill(availabilityReads===1?{json:[]}:{status:503,json:{error:"Availability read unavailable"}});});
 await page.route("**/v1/doctor/appointments/Working/cancel",route=>route.fulfill({json:{ok:true}}));
 await page.goto("/dashboard");
 await expect(page.getByRole("button",{name:"Show in progress appointments (1)",exact:true})).toBeVisible();
 page.once("dialog",dialog=>void dialog.accept("Synthetic cancellation reason"));
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Appointment cancelled"})).toBeVisible();
 await expect(page.getByRole("alert").filter({hasText:"Cancellation saved. Open slots could not be refreshed"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Show in progress appointments (0)",exact:true})).toBeVisible();
 await expect(page.locator("#appointment-queue").getByText("CANCELLED",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Cancel",exact:true})).toHaveCount(0);
});
