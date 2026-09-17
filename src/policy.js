/**
 * Work-item policy (the ADO analog of "Check for linked work items").
 *
 * A bare AB#359 in the PR is not enough. Azure Boards only rewrites a
 * valid work item in the description into a markdown link:
 *   [AB#123](https://dev.azure.com/{org}/{project}/_workitems/edit/123)
 * Invalid ids, title-only mentions, and unconnected repos stay as plain
 * AB# text and must fail.
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

export function evaluateWorkItemPolicy({ title = "", body = "", author = "" } = {}) {
  if (SKIP_AUTHORS.has(author)) {
    return {
      ok: true,
      skipped: true,
      ids: [],
      unlinked: [],
      reason: `Skipped work-item policy for ${author}`,
    };
  }

  // Azure Boards links the description, not the title. Still scan both so a
  // title-only AB# is reported as unlinked instead of silently ignored.
  const { linked, unlinked } = extractWorkItems(`${title}\n${body}`);

  if (linked.length === 0 && unlinked.length === 0) {
    return {
      ok: false,
      skipped: false,
      ids: [],
      unlinked: [],
      reason:
        "No Azure Boards work item found. Add a valid AB#123 to the pull request description (not only the title).",
    };
  }

  if (linked.length === 0) {
    return {
      ok: false,
      skipped: false,
      ids: [],
      unlinked,
      reason:
        `Found ${unlinked.map((id) => `AB#${id}`).join(", ")} but Azure Boards did not create a work-item link. ` +
        "That means the id is invalid, the mention is only in the title, or this GitHub repo is not connected to Azure Boards.",
    };
  }

  if (unlinked.length > 0) {
    return {
      ok: false,
      skipped: false,
      ids: linked,
      unlinked,
      reason:
        `Unlinked or invalid references: ${unlinked.map((id) => `AB#${id}`).join(", ")}. ` +
        "Remove them or use work item ids that Azure Boards can link from the PR description.",
    };
  }

  return {
    ok: true,
    skipped: false,
    ids: linked,
    unlinked: [],
    reason: `Linked work items: ${linked.map((id) => `AB#${id}`).join(", ")}`,
  };
}
