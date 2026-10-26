/**
 * Row 176 — the demand exclusion also drops the QA domain traveloure-qa.test.
 * The older @traveloure.test pattern stays. Pure unit tests, no DB.
 * Run: tsx --test server/__tests__/demand-test-exclusion-qa-domain.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { trips, users } from "@shared/schema";
import { WAITLIST_QA_EMAIL_DOMAIN } from "@shared/launch-waitlist";
import {
  ALL_TEST_ACCOUNT_EMAIL_PATTERNS,
  QA_TEST_ACCOUNT_EMAIL_DOMAIN,
  TEST_ACCOUNT_EMAIL_PATTERNS,
  isRealAccountSql,
  isRealTripSql,
  isSyntheticCohortTrip,
  isSyntheticTrip,
  isTestAccountEmail,
} from "../services/demand-test-exclusion";

test("QD1: an address at traveloure-qa.test is a test account", () => {
  assert.equal(isTestAccountEmail("tester@traveloure-qa.test"), true);
  assert.equal(isTestAccountEmail("TESTER@TRAVELOURE-QA.TEST"), true, "case-insensitive");
  assert.equal(isTestAccountEmail("  tester@traveloure-qa.test  "), true, "trimmed");
});

test("QD2: the QA domain is anchored; a real or absent email is not a test account", () => {
  assert.equal(isTestAccountEmail("x@traveloure-qa.test.example.com"), false, "no suffix spoof");
  assert.equal(isTestAccountEmail("x@notraveloure-qa.test"), false, "no prefix spoof");
  assert.equal(isTestAccountEmail("x@traveloure.com"), false);
  assert.equal(isTestAccountEmail(null), false);
  assert.equal(isTestAccountEmail(undefined), false);
  assert.equal(isTestAccountEmail(""), false);
});

test("QD3: the older @traveloure.test domain still matches", () => {
  assert.equal(isTestAccountEmail("seed@traveloure.test"), true);
});

test("QD4: a QA-domain trip with no author is synthetic; a real email with no author is not", () => {
  assert.equal(isSyntheticTrip({ email: "q@traveloure-qa.test", authorId: null }), true);
  assert.equal(isSyntheticTrip({ email: "traveler@gmail.com", authorId: null }), false);
});

test("QD5: a QA-domain unowned trip is not an R38 synthetic cohort, same as the old domain", () => {
  assert.equal(
    isSyntheticCohortTrip({ email: "q@traveloure-qa.test", userId: null, authorId: null }, 20),
    false,
  );
});

/** Params named by $n placeholders in a SQL slice (PgDialect is 1-based). */
function paramsIn(sqlText: string, params: unknown[]): unknown[] {
  return [...sqlText.matchAll(/\$(\d+)/g)].map((m) => params[Number(m[1]) - 1]);
}

test("QD6: account SQL and the R38 cohort rule both exclude every pattern, NULL branch intact", () => {
  const dialect = new PgDialect();
  const account = dialect.sqlToQuery(isRealAccountSql(users.email));
  assert.deepEqual(account.params, ["%@traveloure.test", "%@traveloure-qa.test"]);
  assert.match(account.sql, /"users"\."email" IS NULL OR \("users"\."email" NOT ILIKE \$1 AND "users"\."email" NOT ILIKE \$2\)/);

  const trip = dialect.sqlToQuery(isRealTripSql(users.email, trips.authorId, {
    userId: trips.userId,
    destination: trips.destination,
    startDate: trips.startDate,
    endDate: trips.endDate,
    createdAt: trips.createdAt,
  }));
  const cohortAt = trip.sql.indexOf("cohort_users.email");
  assert.ok(cohortAt >= 0, "cohort rule names cohort_users.email");
  const cohortSql = trip.sql.slice(cohortAt);
  assert.match(
    cohortSql,
    /cohort_users\.email IS NULL OR \(cohort_users\.email NOT ILIKE \$(\d+) AND cohort_users\.email NOT ILIKE \$(\d+)\)/,
  );
  const cohortParams = paramsIn(cohortSql, trip.params);
  assert.ok(cohortParams.includes("%@traveloure.test"), "cohort rule still excludes the older domain");
  assert.ok(cohortParams.includes("%@traveloure-qa.test"), "cohort rule excludes the QA domain (the [0] trap)");
  assert.deepEqual([...ALL_TEST_ACCOUNT_EMAIL_PATTERNS], ["%@traveloure.test", "%@traveloure-qa.test"]);
});

test("QD7: the QA domain literal equals WAITLIST_QA_EMAIL_DOMAIN", () => {
  assert.equal(QA_TEST_ACCOUNT_EMAIL_DOMAIN, WAITLIST_QA_EMAIL_DOMAIN);
});

test("QD8: TEST_ACCOUNT_EMAIL_PATTERNS is still exactly the older seed pattern", () => {
  assert.deepEqual([...TEST_ACCOUNT_EMAIL_PATTERNS], ["%@traveloure.test"]);
});
