/**
 * R3 U7: the deletion-request body is four fields, and the subject and message are fixed text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { r3DeletionRequestBody, DELETION_SUBJECT, DELETION_MESSAGE, DELETION_FALLBACK_NAME } from "../r3-settings";

test("a full name is used as-is", () => {
  const body = r3DeletionRequestBody({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" });
  assert.deepEqual(body, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    subject: DELETION_SUBJECT,
    message: DELETION_MESSAGE,
  });
});

test("no name falls back, and a single name is not padded", () => {
  assert.equal(r3DeletionRequestBody({ email: "a@b.c" }).name, DELETION_FALLBACK_NAME);
  assert.equal(r3DeletionRequestBody({ firstName: "Ada", email: "a@b.c" }).name, "Ada");
  assert.equal(r3DeletionRequestBody({ firstName: "  ", lastName: " ", email: "a@b.c" }).name, DELETION_FALLBACK_NAME);
});

test("the subject and the message are the exact strings the brief fixes", () => {
  const body = r3DeletionRequestBody({ firstName: "Ada", lastName: "L", email: "a@b.c" });
  assert.equal(body.subject, "Data Deletion Request");
  assert.equal(body.message, "Account deletion requested from Settings by the signed-in account holder.");
});
