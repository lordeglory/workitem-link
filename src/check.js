/**
 * GitHub Actions entrypoint.
 *
 * Prefer an org-wide Azure Boards lookup so work items in any project pass.
 * If ADO_PAT is not set, fall back to GitHub-created AB# links (connected
 * project only) and wait briefly for Azure Boards to rewrite the description.
 */

import { readFileSync } from "node:fs";
import { evaluateWorkItemPolicy, findWorkItemIds } from "./policy.js";
import { verifyWorkItemIds } from "./azure-boards.js";

const BOARDS_REWRITE_ATTEMPTS = 3;
const BOARDS_REWRITE_WAIT_MS = 5000;

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
  const token = process.env.ADO_PAT;
  if (!organization || !token) return null;
  return { organization, token };
}

async function fetchPullRequest(event) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const number = event.pull_request?.number;
  if (!token || !repo || !number) return event.pull_request;

  const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    console.log(`Could not re-fetch PR #${number} (${response.status}); using webhook payload.`);
    return event.pull_request;
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canRefetch() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY);
}

function policyInput(pr, event, verifiedIds) {
  return {
    title: pr.title,
    body: pr.body,
    author: pr.user?.login ?? event.pull_request?.user?.login,
    verifiedIds,
  };
}

async function evaluateWithBoardsRewrite(event) {
  const attempts = canRefetch() ? BOARDS_REWRITE_ATTEMPTS : 1;
  let result;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const pr = await fetchPullRequest(event);
    result = evaluateWorkItemPolicy(policyInput(pr, event));

    if (result.ok || result.skipped || result.unlinked.length === 0) {
      return result;
    }

    if (attempt < attempts) {
      console.log(
        `Waiting for Azure Boards to link ${result.unlinked.map((id) => `AB#${id}`).join(", ")} ` +
          `(attempt ${attempt}/${attempts})...`,
      );
      await sleep(BOARDS_REWRITE_WAIT_MS);
    }
  }

  return result;
}

function describeVerified(verified) {
  return verified
    .map((item) => {
      const project = item.project ? ` in ${item.project}` : "";
      const title = item.title ? `: ${item.title}` : "";
      return `AB#${item.id}${project}${title}`;
    })
    .join("; ");
}

async function main() {
  const event = readEvent();
  const pr = event.pull_request;

  if (!pr) {
    console.log("Not a pull_request event; nothing to enforce.");
    return;
  }

  const ado = adoConfig();
  let result;

  if (ado) {
    const latest = await fetchPullRequest(event);
    const ids = findWorkItemIds(`${latest.title}\n${latest.body}`);
    result = evaluateWorkItemPolicy(policyInput(latest, event));
    if (!result.skipped && ids.length > 0) {
      const { verified, missing } = await verifyWorkItemIds(ids, ado);
      result = evaluateWorkItemPolicy({
        ...policyInput(latest, event),
        verifiedIds: verified.map((item) => item.id),
      });
      if (result.ok) {
        result = { ...result, reason: `Verified in Azure Boards: ${describeVerified(verified)}` };
      } else if (missing.length > 0) {
        result = {
          ...result,
          reason: `Not found in Azure DevOps org ${ado.organization} (all projects): ${missing
            .map((id) => `AB#${id}`)
            .join(", ")}`,
        };
      }
    }
  } else {
    result = await evaluateWithBoardsRewrite(event);
  }

  if (result.ok) {
    console.log(result.reason);
    return;
  }

  console.log(`::error::${result.reason}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
