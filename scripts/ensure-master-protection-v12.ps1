$ErrorActionPreference = "Stop"
$repo = if ($env:GITHUB_REPOSITORY) { $env:GITHUB_REPOSITORY } else { "mpaykin1/World_server" }

gh auth status | Out-Host

$body = @{
  required_status_checks = @{
    strict = $true
    contexts = @("check", "quality-regression", "quality-bridge-static")
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $false
    require_code_owner_reviews = $false
    required_approving_review_count = 0
  }
  restrictions = $null
  required_conversation_resolution = $true
  allow_force_pushes = $false
  allow_deletions = $false
} | ConvertTo-Json -Depth 8

$tmp = Join-Path $env:TEMP "world-server-protection-v12.json"
Set-Content -Path $tmp -Value $body -Encoding UTF8

gh api --method PUT `
  -H "Accept: application/vnd.github+json" `
  "repos/$repo/branches/master/protection" `
  --input $tmp | Out-Host

$state = gh api "repos/$repo/branches/master" --jq '{protected:.protected,contexts:.protection.required_status_checks.contexts}'
$state | Out-Host

$protected = gh api "repos/$repo/branches/master" --jq '.protected'
if ($protected -ne "true") {
  throw "master protection verification failed"
}
