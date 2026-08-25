#!/usr/bin/env bash
set -euo pipefail
: "${GH_ADMIN_TOKEN:?GH_ADMIN_TOKEN is required}"
REPO="${GITHUB_REPOSITORY:-mpaykin1/World_server}"
curl -fsS -X PUT \
  -H "Authorization: Bearer ${GH_ADMIN_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/branches/master/protection" \
  -d '{
    "required_status_checks":{"strict":true,"contexts":["quality-regression"]},
    "enforce_admins":true,
    "required_pull_request_reviews":{"required_approving_review_count":1},
    "restrictions":null,
    "required_conversation_resolution":true,
    "allow_force_pushes":false,
    "allow_deletions":false
  }'
echo "master protection requested for ${REPO}"
