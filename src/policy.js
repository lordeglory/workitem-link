/**
 * Work-item policy (the ADO analog of "Check for linked work items").
 *
 * Azure Boards + GitHub linking uses AB#<id> in the PR title or body.
 * This module only decides pass/fail. GitHub Actions turns that into a
 * status check; legacy branch protection requires that check to merge.
 */

const WORK_ITEM_RE = /\bAB#(\d+)\b/gi;
const SKIP_AUTHORS = new Set(["dependabot[bot]", "github-actions[bot]"]);

export function findWorkItemIds(text) {
  const ids = new Set();
  for (const match of String(text ?? "").matchAll(WORK_ITEM_RE)) {
    ids.add(match[1]);
  }
  return [...ids];
}

export function evaluateWorkItemPolicy({ title = "", body = "", author = "" } = {}) {
  if (SKIP_AUTHORS.has(author)) {
    return {
      ok: true,
      skipped: true,
      ids: [],
      reason: `Skipped work-item policy for ${author}`,
    };
  }

  const ids = findWorkItemIds(`${title}\n${body}`);
  if (ids.length === 0) {
    return {
      ok: false,
      skipped: false,
      ids: [],
      reason:
        "No Azure Boards work item found. Add a reference like AB#123 to the pull request title or description.",
    };
  }

  return {
    ok: true,
    skipped: false,
    ids,
    reason: `Linked work items: ${ids.map((id) => `AB#${id}`).join(", ")}`,
  };
}
