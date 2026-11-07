# Live source audit — 2026-10-16

Scope: read-only catalog/advisors on Supabase source `iphfwxjuhsucvdyluink`. Target not accessed. Owner verdict remains PENDING.

- Public: 113 tables, all have RLS enabled.
- Private: 38 tables; 25 without RLS (not automatically exposed to Data API).
- Supabase security advisor: 6 anon-callable SECURITY DEFINER functions; 27 authenticated-callable SECURITY DEFINER findings; 5 RLS-enabled tables with no policies. Verify intentional access, do not revoke production rights blindly.
- Performance advisor: one unindexed foreign key on `public.chain_reaction_private_events` (`chain_reaction_private_events_actor_id_fkey`), and 100 unused-index findings. Do not delete solely on advisory reports.
- Largest source relations by total bytes: `private.quality_runtime_scores` 175693824, `public.gap_closure_evidence` 97632256, `public.gap_closure_runs` 94691328, `private.quality_autopilot_runs` 86851584. Estimates only for row counts, not exact counts.
- Read-only exact-equivalence index grouping returned zero groups; grouping `cron.job` by jobname/schedule returned zero duplicate groups. These checks do not rule out all possible redundancies.

Next: full confidential source/target backups and isolated restore, dependency and authorization audit, then target-only optimization and verified functional improvement. No archive/restore/cutover occurred in this evidence collection.
