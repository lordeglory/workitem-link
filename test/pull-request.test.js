import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePullRequestNumber } from "../src/pull-request.js";

test("reads the number from a pull_request event", () => {
  assert.equal(resolvePullRequestNumber({ pull_request: { number: 4 } }), 4);
});

test("reads the number from a merge_group queue ref", () => {
  assert.equal(
    resolvePullRequestNumber({
      merge_group: { head_ref: "gh-readonly-queue/main/pr-4-c1ee0ca" },
    }),
    4,
  );
});
