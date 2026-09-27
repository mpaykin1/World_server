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

META="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" \
  --jq '[.draft, .head.sha, .base.sha, .base.ref] | @tsv')"
read -r DRAFT PR_HEAD BASE_SHA BASE_REF <<< "$META"
test "$DRAFT" = false
test "$PR_HEAD" = "$EXPECTED"
test "$BASE_REF" = master

CURRENT_MASTER="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/master" \
  --jq '.object.sha')"
test "$BASE_SHA" = "$CURRENT_MASTER"

for ((attempt=1; attempt<=POLL_ATTEMPTS; attempt++)); do
  REVIEW="$(gh api -H 'Accept: application/vnd.github+json' \
    "repos/${GITHUB_REPOSITORY}/commits/${EXPECTED}/check-runs" \
    --jq '[.check_runs[] | select(.name == "World Independent Adversarial Review")] | sort_by(.id) | last // {} | [.status // "absent", .conclusion // ""] | @tsv')"
  read -r STATUS CONCLUSION <<< "$REVIEW"
  # GitHub check-run IDs increase on rerun. A new queued run must supersede an older PASS.
  if test "$STATUS" = completed; then
    test "$CONCLUSION" = success
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
