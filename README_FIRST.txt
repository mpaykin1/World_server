WORLD QUALITY AUTOPILOT V6

1. Read DESKTOP_AI_WORLD_QUALITY_AUTOPILOT.md first.
2. V6 MUST scan the current server/repository for newly appeared graphics technologies before any quality pass.
3. Every runtime graphics technology must receive BOTH a detailing adapter and an optimization adapter.
4. Candidate git branches/refs are inventoried but NEVER count as runtime until checked out and re-scanned.
5. Runtime dependency resilience is audited: CDN/network-only graphics dependencies are reported and local-vendor promotion is a tested candidate, never a blind version change.
6. CPU-first/free-local paths are preferred; paid GPU is never required by this patch.
7. Run apply_world_quality_autopilot.bat from the World_server repository or use the PowerShell installer.
8. Never work directly on master. Never merge/deploy while any gate fails.
9. Synthetic/emulated evidence validates contracts but cannot unlock production 100%.
10. Desktop AI must keep fixing every reproducible required-gate error until all required gates pass; external blockers must be documented, never faked.
