/**
 * Apply (or preview) a legacy branch protection rule that requires
 * the "Work item linked" status check.
 *
 * GitHub has no native "require work item" checkbox. This script is the
 * equivalent: it adds that check to Settings → Branches → Branch protection.
 *
 * Default is dry-run. Pass --apply to PUT the rule.
 *
 *   GITHUB_TOKEN=ghp_... node src/apply-protection.js --owner org --repo name --branch main
 *   GITHUB_TOKEN=ghp_... node src/apply-protection.js --owner org --repo name --branch main --apply
 */

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";

function arg(name, fallback) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  const envName = name.toUpperCase().replaceAll("-", "_");
  return process.env[envName] ?? process.env[`GITHUB_${envName}`] ?? fallback;
}

function requiredArg(name, value) {
  if (!value) {
    throw new Error(`Missing --${name} (or matching env var)`);
  }
  return value;
}

async function github(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message ?? response.statusText;
    const error = new Error(`${method} ${path} → ${response.status} ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function mapReviews(reviews) {
  if (!reviews) return null;
  return {
    dismiss_stale_reviews: Boolean(reviews.dismiss_stale_reviews),
    require_code_owner_reviews: Boolean(reviews.require_code_owner_reviews),
    required_approving_review_count: reviews.required_approving_review_count ?? 1,
    require_last_push_approval: Boolean(reviews.require_last_push_approval),
  };
}

function mapRestrictions(restrictions) {
  if (!restrictions) return null;
  return {
    users: (restrictions.users ?? []).map((user) => user.login ?? user),
    teams: (restrictions.teams ?? []).map((team) => team.slug ?? team),
    apps: (restrictions.apps ?? []).map((app) => app.slug ?? app),
  };
}

function buildProtection(existing, checkName) {
  const existingChecks = existing?.required_status_checks?.checks ?? [];
  const existingContexts = existing?.required_status_checks?.contexts ?? [];

  const checks = [
    ...existingChecks.map((check) => ({
      context: check.context,
      ...(check.app_id ? { app_id: check.app_id } : {}),
    })),
    ...existingContexts
      .filter((context) => !existingChecks.some((check) => check.context === context))
      .map((context) => ({ context })),
  ];

  if (!checks.some((check) => check.context === checkName)) {
    checks.push({ context: checkName });
  }

  if (!existing) {
    return {
      required_status_checks: {
        strict: false,
        contexts: [],
        checks,
      },
      enforce_admins: false,
      required_pull_request_reviews: {
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        required_approving_review_count: 1,
      },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
    };
  }

  return {
    required_status_checks: {
      strict: Boolean(existing.required_status_checks?.strict),
      contexts: [],
      checks,
    },
    enforce_admins: Boolean(existing.enforce_admins?.enabled),
    required_pull_request_reviews: mapReviews(existing.required_pull_request_reviews),
    restrictions: mapRestrictions(existing.restrictions),
    allow_force_pushes: Boolean(existing.allow_force_pushes?.enabled),
    allow_deletions: Boolean(existing.allow_deletions?.enabled),
    required_linear_history: Boolean(existing.required_linear_history?.enabled),
    required_conversation_resolution: Boolean(existing.required_conversation_resolution?.enabled),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const owner = requiredArg("owner", arg("owner", process.env.GITHUB_OWNER));
  const repo = requiredArg("repo", arg("repo", process.env.GITHUB_REPO));
  const branch = requiredArg("branch", arg("branch", process.env.GITHUB_BRANCH ?? "main"));
  const checkName = arg("check-name", process.env.CHECK_NAME ?? "Work item linked");
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("Set GITHUB_TOKEN to a PAT with repo Administration: write");
  }

  let existing = null;
  try {
    existing = await github(
      token,
      "GET",
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`,
    );
  } catch (error) {
    if (error.status !== 404) {
      if (error.status === 403) {
        throw new Error(
          `${error.message}\n\nIf this is a private org repo on GitHub Free, legacy branch protection is not enforced until the org is Team or Enterprise.`,
        );
      }
      throw error;
    }
  }

  const body = buildProtection(existing, checkName);
  const path = `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`;

  console.log(existing ? `Existing protection found on ${owner}/${repo}@${branch}` : `No protection on ${owner}/${repo}@${branch} yet`);
  console.log(`Status check to require: "${checkName}"`);
  console.log(JSON.stringify(body, null, 2));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to PUT this legacy branch protection rule.");
    return;
  }

  const result = await github(token, "PUT", path, body);
  const contexts = result.required_status_checks?.checks?.map((check) => check.context) ?? [];

  console.log("\nLegacy branch protection updated.");
  console.log(`Required checks: ${contexts.join(", ") || "(none)"}`);
  console.log(`UI: https://github.com/${owner}/${repo}/settings/branches`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
