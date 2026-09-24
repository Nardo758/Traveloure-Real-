import { chromium } from "@playwright/test";
const BASE="http://127.0.0.1:5000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await c.newPage();
const email=`j4s-${Date.now()}@traveloure.test`;
await c.request.post(`${BASE}/api/auth/register`, { data: { email, password: "TestPassword123!", firstName: "J4", lastName: "S", userType: "user" } });
await c.request.post(`${BASE}/api/auth/accept-terms`, { data: { acceptTerms: true, acceptPrivacy: true } });
const net=[]; p.on("request", r => { if (r.url().includes("/api/") && r.method()!=="GET") net.push(r.method()+" "+r.url().replace(BASE,"")); });
await p.goto(`${BASE}/experiences/travel/new?destination=Kyoto%2C%20Japan`, { waitUntil: "networkidle" });
await p.getByTestId("button-expert-help-ribbon").click();
await p.getByTestId("button-send-expert-request").waitFor();
net.length=0;
await p.getByTestId("button-send-expert-request").click();
for (const ms of [300, 1200]) { await p.waitForTimeout(ms); await p.screenshot({ path: `docs/audits/journeys/J4/R1-authed-template/send-after-${ms}ms.png` }); }
const toast = await p.locator('[role="status"], li[data-state="open"], [data-sonner-toast]').allInnerTexts();
console.log(JSON.stringify({ net, toast }));
await b.close();
