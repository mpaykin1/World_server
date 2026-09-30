#!/usr/bin/env bash
# Ocean protected-integration eligibility gate.
#
# Fail-closed. READY_FOR_OCEAN is printed only when every Ocean reject
# condition is positively disproved on the exact candidate head:
#   * Fleet certificate present, 40-hex and equal to the exact current head
#   * PR is a real non-draft pull request against master
#   * PR base equals the current master tip (no stale base, no unresolved conflict)
#   * GitHub reports the PR as mergeable (no unresolved conflict)
#   * the independent exact-head adversarial review completed with success
#   * the canonical duplicate/parallel-system review reports no blockers
#   * a concrete rollback target (pre-merge master tip) is resolvable
# Identity is revalidated immediately before success, so a concurrent master
# merge, PR edit or push during polling cannot certify a stale snapshot.
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${EXPECTED:?EXPECTED is required}"
: "${CERTIFIED:?CERTIFIED is required}"

POLL_ATTEMPTS="${REVIEW_POLL_ATTEMPTS:-12}"
POLL_SECONDS="${REVIEW_POLL_SECONDS:-10}"
# The canonical duplicate/parallel-system review. Overridable only so the
# focused regression tests stay hermetic; production never overrides it.
DUPLICATE_COMMAND="${OCEAN_DUPLICATE_COMMAND:-node scripts/duplicate-system-review.js}"
[[ "$POLL_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]
[[ "$POLL_SECONDS" =~ ^[0-9]+$ ]]
SHA40='^[a-f0-9]{40}$'

# Reject a missing, malformed or stale Fleet certificate before any API call.
[[ "$EXPECTED" =~ $SHA40 ]] || { echo "Candidate head is not a 40-hex SHA" >&2; exit 1; }
[[ "$CERTIFIED" =~ $SHA40 ]] || { echo "Fleet certificate is not a 40-hex SHA" >&2; exit 1; }
test "$CERTIFIED" = "$EXPECTED"

read_pr() {
  gh api -H 'Accept: application/vnd.github+json' \
    "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" \
    --jq '[.draft, .head.sha, .base.sha, .base.ref, (.mergeable|tostring)] | @tsv'
}
read_master() {
  gh api -H 'Accept: application/vnd.github+json' \
    "repos/${GITHUB_REPOSITORY}/git/ref/heads/master" --jq '.object.sha'
}

META="$(read_pr)"
read -r DRAFT PR_HEAD BASE_SHA BASE_REF MERGEABLE <<< "$META"
test "$DRAFT" = false
test "$PR_HEAD" = "$EXPECTED"
test "$BASE_REF" = master
[[ "$BASE_SHA" =~ $SHA40 ]]

# A resolvable 40-hex pre-merge master tip is the rollback target. Without it
# integration would have no LKG, so refuse instead of merging blind.
CURRENT_MASTER="$(read_master)"
[[ "$CURRENT_MASTER" =~ $SHA40 ]] || { echo "Rollback target (master tip) unresolvable" >&2; exit 1; }
test "$BASE_SHA" = "$CURRENT_MASTER"

# Reject duplicate/parallel systems through the existing canonical review
# instead of a second detector. Blockers exit non-zero.
# shellcheck disable=SC2086
$DUPLICATE_COMMAND >/dev/null

# The separate, source-trusted .github/workflows/independent-pr-review.yml
# publishes "World Independent Adversarial Review" on the exact PR HEAD,
# on pull_request_target or workflow_dispatch. It is deliberately NOT
# manufactured by Fleet; Fleet must wait for an independent verdict.
# After an actual rebase onto the latest master, BASE_SHA equals
# CURRENT_MASTER. If master advances again, fail closed until revalidated.
for ((attempt=1; attempt<=POLL_ATTEMPTS; attempt++)); do
  REVIEW="$(gh api -H 'Accept: application/vnd.github+json' \
    "repos/${GITHUB_REPOSITORY}/commits/${EXPECTED}/check-runs" \
    --jq '[.check_runs[] | select(.name == "World Independent Adversarial Review")] | sort_by(.id) | last // {} | [.status // "absent", .conclusion // ""] | @tsv')"
  read -r STATUS CONCLUSION <<< "$REVIEW"
  # GitHub check-run IDs increase on rerun. A new queued run must supersede an older PASS.
  if test "$STATUS" = completed; then
    test "$CONCLUSION" = success
    # A concurrent protected-master merge or PR edit during polling invalidates
    # the original snapshot. Revalidate identity immediately before success.
    # mergeable is asserted here, not earlier: GitHub computes it
    # asynchronously and reports null right after a head push.
    FINAL_META="$(read_pr)"
    read -r FINAL_DRAFT FINAL_HEAD FINAL_BASE FINAL_REF FINAL_MERGEABLE <<< "$FINAL_META"
    FINAL_MASTER="$(read_master)"
    test "$FINAL_DRAFT" = false
    test "$FINAL_HEAD" = "$EXPECTED"
    test "$FINAL_REF" = master
    test "$FINAL_BASE" = "$FINAL_MASTER"
    test "$FINAL_MASTER" = "$CURRENT_MASTER"
    test "$FINAL_MERGEABLE" = true
    echo "ROLLBACK_LKG=$CURRENT_MASTER"
    echo "READY_FOR_OCEAN=YES SHA=$CERTIFIED"
    exit 0
  fi
  case "$STATUS" in
    absent|queued|pending|in_progress) ;;
    *) echo "Unexpected independent review status: $STATUS" >&2; exit 1 ;;
  esac
  if test "$attempt" -lt "$POLL_ATTEMPTS"; then sleep "$POLL_SECONDS"; fi
done

echo "Independent review did not pass within the bounded polling window" >&2
exit 1
