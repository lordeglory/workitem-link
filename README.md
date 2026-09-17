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

GitHub required checks live on the **commit SHA**, not the description. Changing `AB#356` to `AB#359` after a green check does not create a new commit, so Merge can still work until a new run finishes. This workflow converts the PR to **draft** as soon as it starts, then marks it ready only if the current description is a real work item. Branch protection also uses **Do not allow bypassing the above settings** so admins cannot merge through that window.

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

The Azure Boards GitHub app only turns `AB#123` into a Development link when the work item is in the **project connected to this repo**. User Story 356 in Lockton is valid, but it will not be rewritten if GitHub is connected to a different project.

This check therefore looks up ids in the **Azure DevOps organization** (all projects):

1. Set repo variable `ADO_ORGANIZATION` to `maunakdass`
2. Set repo secret `ADO_PAT` to an Azure DevOps PAT with **Work Items: Read**

Then `AB#356` passes if that work item exists in Lockton or any other project in that org. `AB#359` still fails if the id does not exist.

Without `ADO_PAT`, the check can only accept GitHub-rewritten links from the connected project.

## Plan limit

On a **private** repository in a **GitHub Free** organization, classic branch protection can be configured but is **not enforced** until the org is Team or Enterprise. The yellow banner on the Branches settings page is that limit. Public repos on Free still enforce the rule.

## What a valid PR looks like

```text
AB#356
```

in the pull request description. Dependabot PRs are skipped.
