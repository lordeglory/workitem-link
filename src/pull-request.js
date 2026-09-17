/**
 * GitHub required checks are stored on the commit SHA, not the PR description.
 * Editing AB#356 to AB#359 does not create a new commit, so a green check
 * stays mergeable until a new run finishes. Resolve the PR from either a
 * pull_request or merge_group event so we always re-read the current body.
 */

export function resolvePullRequestNumber(event) {
  if (event.pull_request?.number) return event.pull_request.number;

  const refs = [event.merge_group?.head_ref, event.merge_group?.head_sha];
  for (const value of refs) {
    const match = String(value ?? "").match(/pr-(\d+)/i);
    if (match) return Number(match[1]);
  }

  return null;
}
