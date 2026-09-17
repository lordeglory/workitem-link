/**
 * GitHub Actions entrypoint.
 *
 * Reads the pull_request event, evaluates the work-item policy, and
 * exits 1 on failure. The workflow job name becomes the status check
 * that legacy branch protection can require.
 */

import { readFileSync } from "node:fs";
import { evaluateWorkItemPolicy } from "./policy.js";
import { verifyWorkItemIds } from "./azure-boards.js";

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error(
      "GITHUB_EVENT_PATH is not set. In Actions this is automatic. Locally run:\n" +
        "  GITHUB_EVENT_PATH=test/fixtures/pr-linked.json node src/check.js",
    );
  }
  return JSON.parse(readFileSync(eventPath, "utf8"));
}

function adoConfig() {
  const organization = process.env.ADO_ORGANIZATION;
  const project = process.env.ADO_PROJECT;
  const token = process.env.ADO_PAT;
  if (!organization || !project || !token) return null;
  return { organization, project, token };
}

async function main() {
  const event = readEvent();
  const pr = event.pull_request;

  if (!pr) {
    console.log("Not a pull_request event; nothing to enforce.");
    return;
  }

  let result = evaluateWorkItemPolicy({
    title: pr.title,
    body: pr.body,
    author: pr.user?.login,
  });

  const ado = adoConfig();
  if (result.ok && !result.skipped && ado) {
    const { verified, missing } = await verifyWorkItemIds(result.ids, ado);
    if (missing.length > 0) {
      result = {
        ok: false,
        skipped: false,
        ids: verified,
        reason: `Azure Boards could not find: ${missing.map((id) => `AB#${id}`).join(", ")}`,
      };
    } else {
      result = {
        ...result,
        reason: `Verified in Azure Boards: ${verified.map((id) => `AB#${id}`).join(", ")}`,
      };
    }
  }

  if (result.ok) {
    console.log(result.reason);
    return;
  }

  // GitHub Actions annotation: shows on the PR Checks tab and files view.
  console.log(`::error::${result.reason}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
