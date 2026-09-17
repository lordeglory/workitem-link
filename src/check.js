/**
 * GitHub Actions entrypoint.
 *
 * Reads the pull_request event, re-fetches the latest description (Azure
 * Boards may rewrite AB# into a real link after the webhook fires), and
 * fails unless a linked work item URL is present.
 */

import { readFileSync } from "node:fs";
import { evaluateWorkItemPolicy } from "./policy.js";
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
  const project = process.env.ADO_PROJECT;
  const token = process.env.ADO_PAT;
  if (!organization || !project || !token) return null;
  return { organization, project, token };
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

async function evaluateWithBoardsRewrite(event) {
  const attempts = canRefetch() ? BOARDS_REWRITE_ATTEMPTS : 1;
  let result;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const pr = await fetchPullRequest(event);
    result = evaluateWorkItemPolicy({
      title: pr.title,
      body: pr.body,
      author: pr.user?.login ?? event.pull_request?.user?.login,
    });

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

async function main() {
  const event = readEvent();
  const pr = event.pull_request;

  if (!pr) {
    console.log("Not a pull_request event; nothing to enforce.");
    return;
  }

  let result = await evaluateWithBoardsRewrite(event);

  const ado = adoConfig();
  if (result.ok && !result.skipped && ado) {
    const { verified, missing } = await verifyWorkItemIds(result.ids, ado);
    if (missing.length > 0) {
      result = {
        ok: false,
        skipped: false,
        ids: verified,
        unlinked: missing,
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

  console.log(`::error::${result.reason}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
