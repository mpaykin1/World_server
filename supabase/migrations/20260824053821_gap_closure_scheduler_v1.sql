do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='gap-closure-db-v1' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule('gap-closure-db-v1','*/5 * * * *',$cmd$select public.run_gap_closure_db_cycle('cron');$cmd$);
end $$;
