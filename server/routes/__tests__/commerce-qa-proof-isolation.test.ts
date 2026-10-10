import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { validateInvocation, validateEnvelope, validateOwnedRow } from "../../../scripts/verification/run-commerce-qa-delivery-proof.mjs";

test("QA proof defaults off; malformed permission never reaches transport", () => {
  const env = {NODE_ENV:"development",REPLIT_DEV_DOMAIN:"owned.replit.dev",
    COMMERCE_QA_DELIVERY_PROOF:"1",MESSAGING_DEV_FINGERPRINT:"a".repeat(32)};
  const args = ["--isolated-db","--deliver-qa"];
  assert.doesNotThrow(()=>validateInvocation(env,args));
  for (const bad of [{...env,COMMERCE_QA_DELIVERY_PROOF:undefined},{...env,NODE_ENV:"production"},
    {...env,NODE_ENV:undefined},{...env,REPLIT_DEPLOYMENT:"1"},{...env,REPLIT_DEV_DOMAIN:undefined},
    {...env,MESSAGING_DEV_FINGERPRINT:"invalid"}]) assert.throws(()=>validateInvocation(bad,args));
  for (const bad of [[],["--isolated-db"],["--deliver-qa"],[...args,"--dry-run"]]) {
    assert.throws(()=>validateInvocation(env,bad));
  }
  assert.doesNotThrow(()=>validateInvocation({...env,REPLIT_ENVIRONMENT:"production"},args));
});
test("Every rejection has zero synthetic provider calls; each loop has four reservations only", () => {
  const runId=randomUUID(),accountId=randomUUID();
  const request={runId,accountId,outboxId:1,family:"cart_reminder_1h",mode:"guarded-reminder"};
  const context={runId,schema:`automation_msg_${"a".repeat(16)}`,armed:true,used:0,seen:new Set()};
  const row={traveler_id:accountId,email_type:request.family,to_email:"owned@traveloure-qa.test",
    email:"owned@traveloure-qa.test",status:"processing",qa_fixture:true,
    preferences:{itineraryMarketing:{enabled:true}}};
  let providerCalls=0;
  const invoke=(req:any,ctx:any,r:any)=>{validateEnvelope(req,ctx);validateOwnedRow(r,req);providerCalls++};
  for (const ctx of [{...context,armed:false},{...context,schema:"public"},{...context,used:4},
    {...context,seen:new Set(["cart_reminder_1h"])}]) assert.throws(()=>invoke(request,ctx,row));
  for (const req of [{...request,runId:randomUUID()},{...request,to:"outside@example.invalid"},
    {...request,family:"cart_reminder_4d"},{...request,outboxId:-1},{...request,mode:"template-only"}]) {
    assert.throws(()=>invoke(req,context,row));
  }
  for (const r of [null,{...row,traveler_id:randomUUID()},{...row,qa_fixture:false},
    {...row,email:"not-fixture@example.invalid"},{...row,is_suspended:true},{...row,is_deleted:true},
    {...row,to_email:"different@traveloure-qa.test"},{...row,status:"sent"}]) assert.throws(()=>invoke(request,context,r));
  assert.equal(providerCalls,0);
  invoke(request,context,row); assert.equal(providerCalls,1);
});
test("Production sources cannot read inbox substitution or arm proof transport", () => {
  const files=["server/services/email-outbox.service.ts","server/services/commerce-send-verification.service.ts",
    "server/services/email.service.ts","server/routes/internal.routes.ts"];
  for (const file of files) {
    const source=fs.readFileSync(file,"utf8");
    for (const name of ["COMMERCE_QA_DELIVERY_PROOF","run-commerce-qa-delivery-proof",
      "SIGNUP_QA_TEST_INBOX","ITINERARY_OUTCOME_TEST_EMAIL"]) assert.equal(source.includes(name),false,file);
  }
  const owner=fs.readFileSync("scripts/verification/run-messaging-gate.mjs","utf8");
  assert.ok(owner.includes("Private QA proof channel is not authorized"));
  // Only the two non-credential channel markers may enter the child allowlist.
  assert.equal(/env\.(RESEND_API_KEY|SIGNUP_QA_TEST_INBOX|ITINERARY_OUTCOME_TEST_EMAIL)\s*=/.test(owner),false);
});
