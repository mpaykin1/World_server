# WORLD SERVER QUALITY GOVERNANCE V3

Persistent source of truth:
- `data/quality-scorecard.json` — quality percentages and blockers.
- `data/error-prevention-registry.json` — known mistakes and permanent anti-regression rules.
- `data/golden-components.json` — proven functions/graphics that must be reused everywhere compatible.
- `QUALITY_REPORT.json` — machine-readable generated report.

## Confirmed fix
`node scripts/quality-event.js confirm-fix <error-id> <regression-test-id>`

A confirmed fix becomes `protected` and must have permanent regression coverage.

## Successful solution / graphic promotion
`node scripts/quality-event.js promote <component-id> <exact-source-or-asset-ref> <scope>`

Example: once the user confirms a specific stained-glass implementation is excellent, register its exact source/asset and propagate it to every compatible project that declares windows.

## UI rule
Persistent technical/system text must not obstruct gameplay. Settings, system information, world selection and secondary functions belong inside compact icon buttons/panels, analogous to a compact game menu. Mobile safe areas and touch target sizes are mandatory.

## Release rule
Any release-blocking known error, non-certified app, failed desktop/mobile control/collision/menu check, or missing canonical Golden Component dependency keeps the project in quarantine.
