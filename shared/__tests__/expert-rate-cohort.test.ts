import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPERT_RATE_COHORTS,
  cohortDefinition,
  cohortEnded,
  cohortsForBand,
  expertRateLine,
  expertCohortSettingRefusal,
  isExpertCohortRole,
} from "../expert-rate-cohort";

test("RC1: the beta_2026 cohort pays expert_beta_2026 and its end date is expert_beta_end_date", () => {
  assert.deepEqual(EXPERT_RATE_COHORTS.beta_2026, {
    bandKey: "expert_beta_2026",
    label: "beta",
    endDateSettingKey: "expert_beta_end_date",
  });
  assert.equal(cohortDefinition("beta_2026")?.bandKey, "expert_beta_2026");
  assert.deepEqual(cohortsForBand("expert_beta_2026"), ["beta_2026"]);
  assert.deepEqual(cohortsForBand("expert_standard"), []);
});

test("RC2: a NULL, blank or unknown cohort has no definition", () => {
  for (const cohort of [null, undefined, "", "  ", "beta", "expert_new", "toString", "__proto__"]) {
    assert.equal(cohortDefinition(cohort as any), null, String(cohort));
  }
});

test("RC3: the expert's rate line", () => {
  assert.equal(
    expertRateLine({ platformRate: 0.15, cohortLabel: "beta", lockedAt: "2026-10-16T14:00:00.000Z" }),
    "Your rate: 15%, beta cohort, locked Oct 16, 2026",
  );
});

test("RC4: no cohort clause without a cohort, and no line without a usable rate", () => {
  assert.equal(expertRateLine({ platformRate: 0.25, cohortLabel: null, lockedAt: null }), "Your rate: 25%");
  assert.equal(expertRateLine({ platformRate: 0.25, cohortLabel: "beta", lockedAt: null }), "Your rate: 25%");
  for (const rate of [null, undefined, NaN, -0.1, 1, 1.5]) {
    assert.equal(expertRateLine({ platformRate: rate as any, cohortLabel: "beta", lockedAt: "2026-10-16" }), null);
  }
  assert.equal(expertRateLine(null), null);
});

test("RC5: the end date is inclusive; a blank end date never ends; a malformed one ends", () => {
  const day = new Date("2026-12-31T23:59:00Z");
  assert.equal(cohortEnded(null, day), false);
  assert.equal(cohortEnded("", day), false);
  assert.equal(cohortEnded("2026-12-31", day), false);
  assert.equal(cohortEnded("2026-12-30", day), true);
  assert.equal(cohortEnded("2027-01-01", day), false);
  for (const bad of ["31/12/2026", "2026-13-01", "2026-02-30", "soon"]) assert.equal(cohortEnded(bad, day), true, bad);
});

test("RC6: cohorts apply to travel_expert, local_expert and event_planner only", () => {
  for (const role of ["travel_expert", "local_expert", "event_planner"]) assert.equal(isExpertCohortRole(role), true);
  for (const role of ["executive_assistant", "expert", "service_provider", "admin", "support", "moderator", "user", null]) {
    assert.equal(isExpertCohortRole(role as any), false, String(role));
  }
});

test("RC7: the admin settings rail's checks for the three FE-2 settings", () => {
  assert.equal(expertCohortSettingRefusal("expert_beta_end_date", ""), null);
  assert.equal(expertCohortSettingRefusal("expert_beta_end_date", "2027-03-31"), null);
  assert.match(expertCohortSettingRefusal("expert_beta_end_date", "2027-02-30")!, /YYYY-MM-DD/);
  assert.equal(expertCohortSettingRefusal("expert_approval_rate_cohort", ""), null);
  assert.equal(expertCohortSettingRefusal("expert_approval_rate_cohort", "beta_2026"), null);
  assert.match(expertCohortSettingRefusal("expert_approval_rate_cohort", "expert_new")!, /beta_2026/);
  assert.equal(expertCohortSettingRefusal("expert_rate_change_notice_days", "30"), null);
  for (const bad of ["0", "-1", "30.5", "thirty", "366", ""]) {
    assert.ok(expertCohortSettingRefusal("expert_rate_change_notice_days", bad), bad);
  }
  assert.equal(expertCohortSettingRefusal("maintenance_mode", "anything"), null);
});
