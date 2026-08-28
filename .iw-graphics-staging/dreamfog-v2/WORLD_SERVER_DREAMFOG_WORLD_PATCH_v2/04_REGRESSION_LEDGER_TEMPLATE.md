# DreamFog regression ledger template

Use the existing server registries as authoritative storage. This file is only a human-readable template if a root cause needs manual review.

For every repaired defect capture:

- Date / commit / branch
- Symptom
- Reproduction command / URL / device profile
- Root cause
- Authoritative subsystem changed
- Why no existing subsystem could solve it unchanged
- Regression test added or strengthened
- Commands that passed afterward
- Performance before / after
- Visual quality before / after
- Whether `quality:learn-fix`, `regressions:capture`, and `quality:knowledge` were run
- Whether the fix should be promoted to other worlds

Never write “fixed” without evidence from a test or measured production/preview behavior.
