/**
 * Azure Boards existence check at organization scope.
 *
 * Work item ids are unique in an Azure DevOps org, not in a single project.
 * Query without a project so AB#356 in Lockton still counts when this GitHub
 * repo is connected to a different project.
 */

function authHeader(pat) {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

export function workItemsListUrl(organization, ids) {
  const params = new URLSearchParams({
    ids: ids.join(","),
    errorPolicy: "Omit",
    "api-version": "7.1",
  });
  return `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems?${params}`;
}

export function parseWorkItemList(payload, requestedIds) {
  const found = new Map();
  for (const item of payload?.value ?? []) {
    found.set(String(item.id), {
      id: String(item.id),
      title: item.fields?.["System.Title"] ?? "",
      project: item.fields?.["System.TeamProject"] ?? "",
      type: item.fields?.["System.WorkItemType"] ?? "",
    });
  }

  const verified = [];
  const missing = [];
  for (const id of requestedIds.map(String)) {
    if (found.has(id)) verified.push(found.get(id));
    else missing.push(id);
  }
  return { verified, missing };
}

export async function verifyWorkItemIds(ids, { organization, token }) {
  if (ids.length === 0) return { verified: [], missing: [] };

  const response = await fetch(workItemsListUrl(organization, ids), {
    headers: {
      Authorization: authHeader(token),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Azure Boards lookup failed (${response.status}) for org ${organization}. ` +
        `Check ADO_ORGANIZATION and ADO_PAT (Work Items: Read). ${detail}`.trim(),
    );
  }

  return parseWorkItemList(await response.json(), ids);
}
