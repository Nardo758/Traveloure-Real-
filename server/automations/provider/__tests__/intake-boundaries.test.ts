import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { dispatchAutomationEvent } from "../../event-dispatcher";
import { createAutomationRegistry } from "../../registry";
import { intakeAutomations } from "../intake-index";

const routes = readFileSync(new URL("../../../routes.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("routes.ts", routes, ts.ScriptTarget.Latest, true);
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === name) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

test("provider intake nodes validate unique IDs and preserve callback results and errors", async () => {
  const registry = createAutomationRegistry(intakeAutomations);
  assert.equal(registry.byId.size, 2);
  for (const definition of intakeAutomations) {
    assert.equal(definition.trigger.kind, "event");
    if (definition.trigger.kind !== "event") continue;
    let executions = 0;
    const result = { persisted: true };
    const context = { event: definition.trigger.events[0], userId: "fixture-user", formId: "fixture-form" };
    const dispatched = await dispatchAutomationEvent(registry, definition.id, context, () => {
      executions++;
      return result;
    });
    assert.equal(executions, 1);
    assert.equal(dispatched.executed, true);
    if (dispatched.executed) assert.equal(dispatched.result, result);
    const error = new Error("original profile write failed");
    await assert.rejects(dispatchAutomationEvent(registry, definition.id, context, () => {
      throw error;
    }), (caught) => caught === error);
    assert.deepEqual(await dispatchAutomationEvent(registry, definition.id, { ...context, userId: "" }, () => {
      throw new Error("invalid context must not execute");
    }), { executed: false, reason: "condition" });
  }
});

test("bio mirror stays inside its original nonblank guard and nonfatal catch, with six original callers", () => {
  let helper: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "mirrorBioToUsersRow") helper = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(helper?.body);
  const body = helper.body.getText(source);
  assert.match(body, /typeof bio !== "string" \|\| bio\.trim\(\)\.length === 0/);
  assert.match(body, /catch \(e: any\)/);
  const dispatches = calls(helper, "dispatchProviderEvent");
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].arguments[0].getText(source), '"provider.application-bio-mirror"');
  const callback = dispatches[0].arguments[4];
  assert.ok(ts.isArrowFunction(callback));
  assert.match(callback.body.getText(source), /db\.update\(users\)\.set\(\{ bio: bio\.trim\(\) \}\)\.where\(eq\(users\.id, userId\)\)/);
  assert.equal(calls(source, "mirrorBioToUsersRow").length, 6);
});

test("new expert hooks dispatch the original stamp once per alias, outside the unchanged AI calls", () => {
  const stamps = calls(source, "stampNoNeighborhoodsAvailable");
  assert.equal(stamps.length, 2);
  for (const stamp of stamps) {
    const callback = stamp.parent;
    assert.ok(ts.isArrowFunction(callback));
    const dispatch = callback.parent;
    assert.ok(ts.isCallExpression(dispatch));
    assert.equal(dispatch.expression.getText(source), "dispatchProviderEvent");
    assert.equal(dispatch.arguments[0].getText(source), '"provider.expert-application-neighborhood-stamp"');
    assert.equal(calls(callback, "scoreKnowledgeProof").length, 0);
  }
  assert.equal(calls(source, "scoreKnowledgeProof").length, 4);
  for (const path of ["/api/expert-application", "/api/expert-forms", "/api/provider-application", "/api/provider-forms"]) {
    assert.ok(routes.includes(`app.post("${path}", isAuthenticated`), `${path} retains its authenticated caller`);
  }
  assert.match(routes, /err instanceof ExpertApplicationExistsError/);
  assert.match(routes, /PROVIDER_APPLICATION_HISTORY_STATUSES = new Set\(\["rejected", "deleted", "deactivated"\]\)/);
});