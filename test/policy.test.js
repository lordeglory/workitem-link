import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateWorkItemPolicy, extractWorkItems, findWorkItemIds } from "../src/policy.js";

test("extracts AB# ids from mixed text", () => {
  assert.deepEqual(findWorkItemIds("Fixes AB#12 and ab#99"), ["12", "99"]);
});

test("ignores AB# glued to another word", () => {
  assert.deepEqual(findWorkItemIds("FAB#12"), []);
});

test("treats a real Azure Boards markdown link as linked", () => {
  const { linked, unlinked } = extractWorkItems(
    "Fixes [AB#1842](https://dev.azure.com/fabrikam/web/_workitems/edit/1842)",
  );
  assert.deepEqual(linked, ["1842"]);
  assert.deepEqual(unlinked, []);
});

test("fails when the PR has no work item", () => {
  const result = evaluateWorkItemPolicy({
    title: "Fix login timeout",
    body: "Users were getting kicked out.",
    author: "maunak",
  });
  assert.equal(result.ok, false);
});

test("fails for a bare AB# that Azure Boards did not link", () => {
  const result = evaluateWorkItemPolicy({
    title: "Fix header formatting",
    body: "AB#359",
    author: "maunak",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unlinked, ["359"]);
});

test("fails when AB# is only in the title", () => {
  const result = evaluateWorkItemPolicy({
    title: "AB#1842 Fix login timeout",
    body: "Users were getting kicked out.",
    author: "maunak",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unlinked, ["1842"]);
});

test("passes when Azure Boards created a work-item link in the body", () => {
  const result = evaluateWorkItemPolicy({
    title: "Fix login timeout",
    body: "Fixes [AB#1842](https://dev.azure.com/fabrikam/web/_workitems/edit/1842)",
    author: "maunak",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ids, ["1842"]);
});

test("fails when a fake markdown link id does not match the URL", () => {
  const result = evaluateWorkItemPolicy({
    title: "Fix login timeout",
    body: "[AB#359](https://dev.azure.com/fabrikam/web/_workitems/edit/1842)",
    author: "maunak",
  });
  assert.equal(result.ok, false);
});

test("passes a bare AB# when Azure DevOps confirms it exists in any project", () => {
  const result = evaluateWorkItemPolicy({
    title: "Update README.md",
    body: "AB#356",
    author: "maunak",
    verifiedIds: ["356"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ids, ["356"]);
});

test("fails a bare AB# when Azure DevOps does not have that id", () => {
  const result = evaluateWorkItemPolicy({
    title: "Update README.md",
    body: "AB#359",
    author: "maunak",
    verifiedIds: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unlinked, ["359"]);
});

test("skips dependabot", () => {
  const result = evaluateWorkItemPolicy({
    title: "Bump lodash",
    body: "",
    author: "dependabot[bot]",
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});
