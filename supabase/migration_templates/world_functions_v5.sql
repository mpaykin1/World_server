-- WORLD_SERVER V5 safe function delivery. Apply through Supabase migration workflow after advisors.
create table if not exists public.world_function_catalog(
  function_id text primary key check(function_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  version text not null, manifest jsonb not null default '{}'::jsonb, artifact_sha256 text not null,
  source_revision text, status text not null default 'bundled' check(status in ('proposed','bundled','deprecated','blocked')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.world_function_installations(
  id uuid primary key default gen_random_uuid(), function_id text not null references public.world_function_catalog(function_id), version text not null,
  world_id text not null default '*', slot text not null check(slot in ('sandbox','navigator')), enabled boolean not null default false,
  rollout_percent int not null default 0 check(rollout_percent between 0 and 100), evidence_ref text null, config jsonb not null default '{}'::jsonb,
  installed_by uuid null references auth.users(id), installed_at timestamptz not null default now(), unique(function_id,version,world_id,slot)
);
create table if not exists public.world_function_requests(
  id uuid primary key default gen_random_uuid(), requested_by uuid not null references auth.users(id), world_id text null,
  title text not null check(length(title)<=160), description text not null check(length(description)<=4000), locale text not null default 'en',
  status text not null default 'proposed' check(status in ('proposed','triaged','accepted','rejected','implemented','released')),
  game_design_section text null, created_at timestamptz not null default now()
);
create table if not exists public.world_function_events(
  id bigint generated always as identity primary key, function_id text not null, version text null, world_id text null, user_id uuid null references auth.users(id),
  slot text null, event text not null, ok boolean not null default true, latency_ms int null, correlation_id text null, created_at timestamptz not null default now()
);
alter table public.world_function_catalog enable row level security;alter table public.world_function_installations enable row level security;alter table public.world_function_requests enable row level security;alter table public.world_function_events enable row level security;
grant select on public.world_function_catalog to authenticated;grant select on public.world_function_installations to authenticated;grant select,insert on public.world_function_requests to authenticated;
create policy "authenticated read bundled function catalog" on public.world_function_catalog for select to authenticated using(status in ('bundled','deprecated'));
create policy "authenticated read enabled function installations" on public.world_function_installations for select to authenticated using(enabled=true);
create policy "users create own function requests" on public.world_function_requests for insert to authenticated with check((select auth.uid())=requested_by);
create policy "users read own function requests" on public.world_function_requests for select to authenticated using((select auth.uid())=requested_by);
-- No client write policy exists for installations/catalog/events. Server-side admin path owns promotion and evidence writes.
