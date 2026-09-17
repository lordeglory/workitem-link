/**
 * Work-item policy (the ADO analog of "Check for linked work items").
 *
 * Two ways to pass:
 * 1. Azure Boards rewrote a valid mention into a work-item URL in the PR body
 *    (only works for the project connected to this GitHub repo).
 * 2. The check looked up AB# ids in the Azure DevOps org (any project).
 */

const LINKED_RE =
  /\[AB#(\d+)\]\((https?:\/\/[^)\s]+\/_workitems\/edit\/(\d+)(?:\?[^)\s]*)?)\)/gi;
const BARE_RE = /\bAB#(\d+)\b/gi;
const SKIP_AUTHORS = new Set(["dependabot[bot]", "github-actions[bot]"]);

export function extractWorkItems(text) {
  const source = String(text ?? "");
  const linked = [];
  const linkedIds = new Set();

  for (const match of source.matchAll(LINKED_RE)) {
    const [, id, , urlId] = match;
    if (id === urlId) {
      linkedIds.add(id);
      linked.push(id);
    }
  }

  const unlinked = [];
  const withoutLinked = source.replace(LINKED_RE, "");
  for (const match of withoutLinked.matchAll(BARE_RE)) {
    const id = match[1];
    if (!linkedIds.has(id)) unlinked.push(id);
  }

  return {
    linked: [...new Set(linked)],
    unlinked: [...new Set(unlinked)],
  };
}

export function findWorkItemIds(text) {
  const { linked, unlinked } = extractWorkItems(text);
  return [...new Set([...linked, ...unlinked])];
}

function formatIds(ids) {
  return ids.map((id) => `AB#${id}`).join(", ");
}

export function evaluateWorkItemPolicy({
  title = "",
  body = "",
  author = "",
  verifiedIds = null,
} = {}) {
  if (SKIP_AUTHORS.has(author)) {
    return {
      ok: true,
      skipped: true,
      ids: [],
      unlinked: [],
      reason: `Skipped work-item policy for ${author}`,
    };
  }

  const { linked, unlinked } = extractWorkItems(`${title}\n${body}`);
  const ids = [...new Set([...linked, ...unlinked])];

  if (ids.length === 0) {
    return {
      ok: false,
      skipped: false,
      ids: [],
      unlinked: [],
      reason:
        "No Azure Boards work item found. Add AB#123 to the pull request description.",
    };
  }

  if (Array.isArray(verifiedIds)) {
    const verifiedSet = new Set(verifiedIds.map(String));
    const found = ids.filter((id) => verifiedSet.has(id));
    const missing = ids.filter((id) => !verifiedSet.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        skipped: false,
        ids: found,
        unlinked: missing,
        reason: `Not found in the Azure DevOps organization: ${formatIds(missing)}. Ids are checked across all projects.`,
      };
    }
    return {
      ok: true,
      skipped: false,
      ids: found,
      unlinked: [],
      reason: `Verified in Azure Boards: ${formatIds(found)}`,
    };
  }

  if (linked.length === 0) {
    return {
      ok: false,
      skipped: false,
      ids: [],
      unlinked,
      reason:
        `Found ${formatIds(unlinked)} but Azure Boards did not create a work-item link. ` +
        "The GitHub connection only links work items in the connected project. " +
        "Set ADO_ORGANIZATION and ADO_PAT to accept valid ids from any project in that Azure DevOps org.",
    };
  }

  if (unlinked.length > 0) {
    return {
      ok: false,
      skipped: false,
      ids: linked,
      unlinked,
      reason:
        `Unlinked or invalid references: ${formatIds(unlinked)}. ` +
        "Remove them, or set ADO_ORGANIZATION and ADO_PAT to verify ids across projects.",
    };
  }

  return {
    ok: true,
    skipped: false,
    ids: linked,
    unlinked: [],
    reason: `Linked work items: ${formatIds(linked)}`,
  };
}
