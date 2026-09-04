-- BROWSER LOCAL WORKER HEARTBEAT V3 VERSION — exact source for already applied LIVE migration 20260904051315
-- Applied live by Browser ChatGPT via Supabase connector, verified via heartbeat version 2026-09-03.v3 (43 caps, online true)
-- Preserves LIVE security model: SECURITY DEFINER, private.browser_ai_worker_tokens (worker/active/expires_at/token_hash)
-- Adds p_version param, validates bounded length and charset, stores passed version instead of hardcoded v2-token-auth
-- Keeps backward compat 5-arg overload, does not change worker secret, does not widen grants, does not expose private table
-- 2026-09-04

begin;

alter table public.browser_ai_heartbeats alter column version set default '2026-09-03.v3';

drop function if exists public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb);
drop function if exists public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text);

create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb default '[]'::jsonb,
  p_current_task text default null,
  p_detail jsonb default '{}'::jsonb,
  p_version text default '2026-09-03.v3'
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_version text := coalesce(nullif(trim(p_version),''), '2026-09-03.v3');
  v_valid boolean;
begin
  select exists(
    select 1 from private.browser_ai_worker_tokens
    where worker = p_worker
      and active is true
      and (expires_at is null or expires_at > now())
      and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
  ) into v_valid;
  if not coalesce(v_valid,false) then
    raise exception 'invalid worker credentials';
  end if;
  if p_worker is null or char_length(trim(p_worker)) < 3 then raise exception 'worker required'; end if;
  if char_length(v_version) > 32 or char_length(v_version) < 1 then raise exception 'invalid version length'; end if;
  if v_version !~ '^[A-Za-z0-9._-]+$' then raise exception 'invalid version format'; end if;
  insert into public.browser_ai_heartbeats(worker, version, capabilities, detail, current_task, last_seen, online)
  values (left(trim(p_worker),120), v_version, coalesce(p_capabilities,'[]'::jsonb), coalesce(p_detail,'{}'::jsonb), p_current_task, now(), true)
  on conflict (worker) do update set version = excluded.version, capabilities = excluded.capabilities, detail = excluded.detail, current_task = excluded.current_task, last_seen = now(), online = true;
  return jsonb_build_object('ok', true, 'worker', p_worker, 'version', v_version, 'at', now());
end;
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb,text) to anon, authenticated, service_role;

create or replace function public.browser_ai_worker_heartbeat(
  p_worker text,
  p_token text,
  p_capabilities jsonb,
  p_current_task text,
  p_detail jsonb
) returns jsonb
language sql
security definer
set search_path = public, private, extensions, pg_temp
as $$
  select public.browser_ai_worker_heartbeat(p_worker, p_token, p_capabilities, p_current_task, p_detail, '2026-09-03.v3');
$$;
revoke all on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) from public;
grant execute on function public.browser_ai_worker_heartbeat(text,text,jsonb,text,jsonb) to anon, authenticated, service_role;

commit;
