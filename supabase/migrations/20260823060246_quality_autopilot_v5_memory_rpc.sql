begin;
create or replace function public.quality_record_improvement_cycle(p_cycle jsonb)
returns void
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_run_id text := nullif(p_cycle->>'runId','');
  v_project_id text := coalesce(nullif(p_cycle->>'projectId',''),'world-server');
  v_mode text := coalesce(nullif(p_cycle->>'mode',''),'observe');
  v_lane text := coalesce(nullif(p_cycle->>'focusLane',''),'mixed');
  v_status text := coalesce(nullif(p_cycle->>'status',''),'unknown');
  v_fingerprint text := nullif(p_cycle->>'fingerprint','');
  v_issue_key text := coalesce(nullif(p_cycle->>'issueKey',''),v_lane);
  v_delta double precision := coalesce((p_cycle->>'scoreDelta')::double precision,0);
  v_outcome text;
begin
  if v_run_id is null then raise exception 'runId required'; end if;
  if v_mode not in ('observe','candidate','autopilot') then v_mode := 'observe'; end if;
  if v_lane not in ('automation','graphics','animation','code','mixed') then v_lane := 'mixed'; end if;
  insert into private.quality_improvement_cycles(run_id,project_id,mode,focus_lane,status,baseline,candidate,decision,protected_gate,finished_at)
  values(v_run_id,v_project_id,v_mode,v_lane,v_status,coalesce(p_cycle->'baseline','{}'::jsonb),coalesce(p_cycle->'candidate','{}'::jsonb),coalesce(p_cycle->'decision','{}'::jsonb),coalesce(p_cycle->'protectedGate','{}'::jsonb),now())
  on conflict(run_id) do update set status=excluded.status,baseline=excluded.baseline,candidate=excluded.candidate,decision=excluded.decision,protected_gate=excluded.protected_gate,finished_at=excluded.finished_at;

  if v_fingerprint is not null then
    v_outcome := case when v_status='accepted' then 'accepted' when v_status='rejected' then 'rejected' else 'unknown' end;
    insert into private.quality_optimizer_memory(fingerprint,project_id,lane,issue_key,outcome,attempts,score_delta,last_reason,metadata,last_seen_at)
    values(v_fingerprint,v_project_id,v_lane,v_issue_key,v_outcome,1,v_delta,p_cycle->>'reason',jsonb_build_object('runId',v_run_id),now())
    on conflict(fingerprint) do update set
      attempts=private.quality_optimizer_memory.attempts+1,
      outcome=excluded.outcome,
      score_delta=excluded.score_delta,
      last_reason=excluded.last_reason,
      metadata=excluded.metadata,
      last_seen_at=now();
  end if;
end;
$$;
revoke all on function public.quality_record_improvement_cycle(jsonb) from public, anon, authenticated;
grant execute on function public.quality_record_improvement_cycle(jsonb) to service_role;
commit;
