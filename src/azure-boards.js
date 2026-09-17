/**
 * Optional Azure Boards existence check.
 *
 * Pattern matching AB#123 is enough to start. Set ADO_ORGANIZATION,
 * ADO_PROJECT, and ADO_PAT if you also want to confirm the work item exists.
 */

function authHeader(pat) {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

export async function verifyWorkItemIds(ids, { organization, project, token }) {
  const verified = [];
  const missing = [];

  for (const id of ids) {
    const url = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1`;
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(token),
        Accept: "application/json",
      },
    });

    if (response.ok) {
      verified.push(id);
    } else {
      missing.push(id);
    }
  }

  return { verified, missing };
}
