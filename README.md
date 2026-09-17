# Work item link policy 

GitHub has no native **Check for linked work items** branch policy like Azure DevOps. This repo is the equivalent, using the two pieces GitHub *does* give you:

1. A pull request check that fails unless the PR mentions `AB#123`
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
merge blocked until AB# is present
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

GITHUB_EVENT_PATH=test/fixtures/pr-linked.json node src/check.js
# exits 0 — AB#1842
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

## Optional: verify the work item in Azure Boards

Pattern matching `AB#123` is the default. To also fail on ids that do not exist, set repo variables/secrets:

- `ADO_ORGANIZATION`
- `ADO_PROJECT`
- `ADO_PAT` (secret, Work Items: Read)

The workflow already forwards those into `src/check.js`.

## Plan limit

On a **private** repository in a **GitHub Free** organization, classic branch protection can be configured but is **not enforced** until the org is Team or Enterprise. The yellow banner on the Branches settings page is that limit. Public repos on Free still enforce the rule.

## What a valid PR looks like

```text
Title: AB#1842 Fix login timeout

or body:
Fixes AB#1842
```

Dependabot PRs are skipped so dependency bumps are not blocked.
