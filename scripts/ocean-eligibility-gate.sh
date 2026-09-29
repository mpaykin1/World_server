#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${EXPECTED:?EXPECTED is required}"
: "${CERTIFIED:?CERTIFIED is required}"

POLL_ATTEMPTS="${REVIEW_POLL_ATTEMPTS:-12}"
POLL_SECONDS="${REVIEW_POLL_SECONDS:-10}"
[[ "$POLL_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]
[[ "$POLL_SECONDS" =~ ^[0-9]+$ ]]
test "$CERTIFIED" = "$EXPECTED"

# The separate, source-trusted .github/workflows/independent-pr-review.yml
# publishes two independent checks on the exact PR HEAD: the workflow job
# `independent-review` and the explicitly published
# `World Independent Adversarial Review`. Both must independently PASS.
# A BLOCK vetoes. INCONCLUSIVE (conclusion=action_required) is NOT PASS and
# fails closed: a review that could not reach a verdict has not approved
# anything. Fleet must wait for a real independent verdict.
REQUIRED_REVIEWS=("independent-review" "World Independent Adversarial Review")

# Read the live PR identity. mergeable/mergeStateStatus are included because
# no other gate in this repository knows whether a PR can actually merge.
# GitHub reports mergeable=CONFLICTING / mergeStateStatus=dirty for a
# conflicting PR; both fail closed. mergeStateStatus values `blocked`,
# `unstable` and `behind` are deliberately NOT rejected: branch protection
# makes `Ocean merge eligibility` itself a required check, so demanding
# `clean` here would deadlock the gate against the very review it awaits.
read_pr_meta() {
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" \
    --jq '[.draft, .head.sha, .base.sha, .base.ref, (.mergeable // ""), (.mergeStateStatus // "")] | @tsv'
}

# Newest check-run id wins: a freshly queued re-review must supersede an
# older PASS instead of being ignored.
read_latest_review() {
  local check_name="$1"
  gh api -H 'Accept: application/vnd.github+json' \
    "repos/${GITHUB_REPOSITORY}/commits/${EXPECTED}/check-runs" \
    --jq '[.check_runs[] | select(.name == "'"${check_name}"'")] | sort_by(.id) | last // {} | [.status // "absent", .conclusion // ""] | @tsv'
}

META="$(read_pr_meta)"
read -r DRAFT PR_HEAD BASE_SHA BASE_REF MERGEABLE MERGE_STATE <<< "$META"
test "$DRAFT" = false
test "$PR_HEAD" = "$EXPECTED"
test "$BASE_REF" = master

CURRENT_MASTER="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/master" \
  --jq '.object.sha')"
test "$BASE_SHA" = "$CURRENT_MASTER"

if test "$MERGEABLE" = CONFLICTING || test "$MERGE_STATE" = dirty; then
  echo "PR is not mergeable: mergeable=$MERGEABLE mergeStateStatus=$MERGE_STATE" >&2
  exit 1
fi

for ((attempt=1; attempt<=POLL_ATTEMPTS; attempt++)); do
  reviews_settled=1
  for CHECK_NAME in "${REQUIRED_REVIEWS[@]}"; do
    REVIEW="$(read_latest_review "$CHECK_NAME")"
    read -r STATUS CONCLUSION <<< "$REVIEW"
    if test "$STATUS" = completed; then
      # Name the actual reason. A bare "BLOCK" with no actionable cause is
      # what made the original incident hard to triage.
      case "$CONCLUSION" in
        success) ;;
        failure)
          echo "Independent review BLOCKED this head: $CHECK_NAME concluded failure" >&2 ;;
        action_required)
          echo "Independent review INCONCLUSIVE for this head: $CHECK_NAME concluded action_required (not a PASS)" >&2 ;;
        *)
          echo "Unexpected independent review conclusion for $CHECK_NAME: $CONCLUSION" >&2 ;;
      esac
      # Every non-success conclusion fails closed.
      test "$CONCLUSION" = success
      continue
    fi
    case "$STATUS" in
      absent|queued|pending|in_progress) reviews_settled=0 ;;
      *) echo "Unexpected independent review status for $CHECK_NAME: $STATUS" >&2; exit 1 ;;
    esac
  done

  # mergeable/mergeStateStatus is null while GitHub is still computing.
  # Re-read until it settles; never assume a not-yet-computed state is safe.
  META="$(read_pr_meta)"
  read -r _DRAFT _PR_HEAD _BASE_SHA _BASE_REF MERGEABLE MERGE_STATE <<< "$META"
  if test "$MERGEABLE" = CONFLICTING || test "$MERGE_STATE" = dirty; then
    echo "PR is not mergeable: mergeable=$MERGEABLE mergeStateStatus=$MERGE_STATE" >&2
    exit 1
  fi
  if test -z "$MERGEABLE" || test "$MERGEABLE" = unknown; then reviews_settled=0; fi

  if test "$reviews_settled" = 1; then
    # A concurrent protected-master merge or PR edit during polling invalidates
    # the original snapshot. Revalidate identity immediately before success.
    FINAL_META="$(read_pr_meta)"
    read -r FINAL_DRAFT FINAL_HEAD FINAL_BASE FINAL_REF _FM _FMS <<< "$FINAL_META"
    FINAL_MASTER="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/master" \
      --jq '.object.sha')"
    test "$FINAL_DRAFT" = false
    test "$FINAL_HEAD" = "$EXPECTED"
    test "$FINAL_REF" = master
    test "$FINAL_BASE" = "$FINAL_MASTER"
    test "$FINAL_MASTER" = "$CURRENT_MASTER"
    echo "READY_FOR_OCEAN=YES SHA=$CERTIFIED"
    exit 0
  fi
  if test "$attempt" -lt "$POLL_ATTEMPTS"; then sleep "$POLL_SECONDS"; fi
done

echo "Independent reviews did not pass within the bounded polling window" >&2
exit 1
