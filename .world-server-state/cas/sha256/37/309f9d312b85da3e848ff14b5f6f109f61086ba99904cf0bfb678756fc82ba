create or replace function public.quality_invoke_worker_now()
returns bigint
language plpgsql
security definer
set search_path='vault','net','pg_temp'
as $$
declare v_request bigint; begin
  select net.http_post(
    url:='https://iphfwxjuhsucvdyluink.supabase.co/functions/v1/quality-runtime-worker',
    body:='{}'::jsonb,
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-quality-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='quality_runtime_worker_token' order by created_at desc limit 1)
    ),
    timeout_milliseconds:=20000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.quality_invoke_worker_now() from public,anon,authenticated;
grant execute on function public.quality_invoke_worker_now() to service_role;
