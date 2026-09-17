import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateWorkItemPolicy, findWorkItemIds } from "../src/policy.js";

test("extracts AB# ids from mixed text", () => {
  assert.deepEqual(findWorkItemIds("Fixes AB#12 and ab#99"), ["12", "99"]);
});

test("ignores AB# glued to another word", () => {
  assert.deepEqual(findWorkItemIds("FAB#12"), []);
});

test("fails when the PR has no work item", () => {
  const result = evaluateWorkItemPolicy({
    title: "Fix login timeout",
    body: "Users were getting kicked out.",
    author: "maunak",
  });
  assert.equal(result.ok, false);
});

test("passes when AB# is in the title", () => {
  const result = evaluateWorkItemPolicy({
    title: "AB#1842 Fix login timeout",
    body: "Users were getting kicked out.",
    author: "maunak",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ids, ["1842"]);
});

test("passes when AB# is in the body", () => {
  const result = evaluateWorkItemPolicy({
    title: "Fix login timeout",
    body: "Related work item: AB#1842",
    author: "maunak",
  });
  assert.equal(result.ok, true);
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
