import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkItemList, workItemsListUrl } from "../src/azure-boards.js";

test("looks up work items at org scope, not a single project", () => {
  const url = workItemsListUrl("maunakdass", ["356", "359"]);
  assert.match(url, /dev\.azure\.com\/maunakdass\/_apis\/wit\/workitems/);
  assert.doesNotMatch(url, /Lockton/);
  assert.match(url, /ids=356%2C359|ids=356,359/);
  assert.match(url, /errorPolicy=Omit/);
});

test("treats omitted ids as missing so fake AB# values fail", () => {
  const { verified, missing } = parseWorkItemList(
    {
      value: [
        {
          id: 356,
          fields: {
            "System.Title": "Build a logout feature",
            "System.TeamProject": "Lockton",
            "System.WorkItemType": "User Story",
          },
        },
      ],
    },
    ["356", "359"],
  );

  assert.deepEqual(
    verified.map((item) => item.id),
    ["356"],
  );
  assert.equal(verified[0].project, "Lockton");
  assert.deepEqual(missing, ["359"]);
});
