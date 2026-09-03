-- V6 distributed write-rate limiter. Apply using the normal Supabase migration workflow.
create table if not exists public.world_rate_limit_buckets_v6 (
  actor_key text not null,
  scope text not null,
  window_started_at timestamptz not null,
  hits integer not null default 0,
  primary key(actor_key,scope)
);
alter table public.world_rate_limit_buckets_v6 enable row level security;
revoke all on public.world_rate_limit_buckets_v6 from anon, authenticated;

create or replace function public.world_consume_rate_limit_v6(p_actor_key text,p_scope text,p_limit integer,p_window_seconds integer)
returns table(allowed boolean,remaining integer,reset_at timestamptz)
language plpgsql security invoker set search_path=public
as $$
declare now_at timestamptz:=clock_timestamp(); row_hit public.world_rate_limit_buckets_v6%rowtype;
begin
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid limiter parameters'; end if;
  insert into public.world_rate_limit_buckets_v6(actor_key,scope,window_started_at,hits)
  values(p_actor_key,p_scope,now_at,1)
  on conflict(actor_key,scope) do update set
    window_started_at=case when excluded.window_started_at-public.world_rate_limit_buckets_v6.window_started_at >= make_interval(secs=>p_window_seconds) then excluded.window_started_at else public.world_rate_limit_buckets_v6.window_started_at end,
    hits=case when excluded.window_started_at-public.world_rate_limit_buckets_v6.window_started_at >= make_interval(secs=>p_window_seconds) then 1 else public.world_rate_limit_buckets_v6.hits+1 end
  returning * into row_hit;
  allowed:=row_hit.hits<=p_limit; remaining:=greatest(0,p_limit-row_hit.hits); reset_at:=row_hit.window_started_at+make_interval(secs=>p_window_seconds); return next;
end $$;
revoke all on function public.world_consume_rate_limit_v6(text,text,integer,integer) from public,anon,authenticated;
-- Server secret/service role calls this RPC; browser never receives direct table/function grants.
