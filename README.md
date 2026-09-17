# Work item link policy  

GitHub has no native **Check for linked work items** branch policy like Azure DevOps. This repo is the equivalent, using the two pieces GitHub *does* give you:

1. A pull request check that fails unless Azure Boards turns `AB#123` into a real work-item link
2. A **legacy branch protection** rule that requires that check before merge

```text
PR opened / edited
        │
        ▼
workflow "Work item linked"   ← src/check.js
        │
        ▼
legacy branch protection      ← src/apply-protection.js
requires status check
"Work item linked"
        │
        ▼
merge blocked until a valid work item is linked
```

You cannot add a new checkbox to GitHub’s Settings → Branches page. Requiring this status check **is** that checkbox.

## Layout

| Path | Role |
|---|---|
| `src/policy.js` | Decide pass/fail from PR title/body |
| `src/check.js` | GitHub Actions entrypoint |
| `src/apply-protection.js` | PUT the legacy branch protection rule |
| `src/azure-boards.js` | Optional: confirm `AB#` ids exist in ADO |
| `.github/workflows/workitem-policy.yml` | Runs the check on every PR |

The workflow job name **Work item linked** must match the required status check name. If you rename one, rename the other.

## Run it locally

```bash
node --test
```

```bash
GITHUB_EVENT_PATH=test/fixtures/pr-missing.json node src/check.js
# exits 1 — no AB#

GITHUB_EVENT_PATH=test/fixtures/pr-unlinked.json node src/check.js
# exits 1 — AB#359 is not a linked work item

GITHUB_EVENT_PATH=test/fixtures/pr-linked.json node src/check.js
# exits 0 — Azure Boards markdown link
```

## Turn it on in a GitHub repo

1. Push this workflow to the default branch.
2. Open a test PR so the check named **Work item linked** appears once. GitHub only lists checks it has seen.
3. Require it with legacy branch protection.

### Option A — GitHub UI

Settings → Branches → Add classic branch protection rule

- Branch name pattern: `main` (or `test`)
- **Require a pull request before merging**
- **Require status checks to pass before merging**
- Search for `Work item linked` and select it

### Option B — API (this repo)

Create a PAT with **Administration: Write** on the repo. Classic `repo` scope also works.

```bash
# preview the PUT body (does not change GitHub)
GITHUB_TOKEN=ghp_... node src/apply-protection.js --owner lordeglory --repo workitem --branch main

# actually create / update the classic rule
GITHUB_TOKEN=ghp_... node src/apply-protection.js --owner lordeglory --repo workitem --branch main --apply
```

The script **merges** with any existing protection. It does not wipe reviews or other required checks.

## What counts as a valid link

`AB#359` as plain text is **not** enough. Azure Boards only converts a **valid** id in the **PR description** into:

```md
[AB#123](https://dev.azure.com/{org}/{project}/_workitems/edit/123)
```

That rewrite is the same signal GitHub shows in the PR Development section. Bare `AB#` text means the id is invalid, it was only put in the title, or this repo is not connected to Azure Boards.

Connect `lordeglory/workitem-link` to your Azure Boards project before expecting a real id to pass.

Optional extra check: set `ADO_ORGANIZATION`, `ADO_PROJECT`, and `ADO_PAT` (Work Items: Read) to also call the Azure Boards REST API.

## Plan limit

On a **private** repository in a **GitHub Free** organization, classic branch protection can be configured but is **not enforced** until the org is Team or Enterprise. The yellow banner on the Branches settings page is that limit. Public repos on Free still enforce the rule.

## What a valid PR looks like

Put the mention in the **description**, then let Azure Boards turn it into a link:

```text
Fixes AB#1842
```

After Boards processes it, the description becomes a work-item URL and the check passes. Dependabot PRs are skipped.
