-- V5 machine-readable Game Design Spec history.
create table if not exists public.world_game_design_specs(
  id uuid primary key default gen_random_uuid(), world_id text not null default 'main', version bigint generated always as identity,
  created_by uuid null references auth.users(id), status text not null default 'draft' check(status in ('draft','candidate','stable','superseded','rejected')),
  spec jsonb not null, spec_hash text not null, source text not null default 'navigator-dialogue', created_at timestamptz not null default now()
);
create index if not exists world_game_design_world_version_idx on public.world_game_design_specs(world_id,version desc);
create table if not exists public.world_game_design_evidence(
  id bigint generated always as identity primary key, spec_id uuid not null references public.world_game_design_specs(id) on delete cascade,
  evidence_type text not null, evidence_ref text not null, pass boolean null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.world_game_design_specs enable row level security;alter table public.world_game_design_evidence enable row level security;
grant select,insert on public.world_game_design_specs to authenticated;grant select on public.world_game_design_evidence to authenticated;
create policy "users create own draft game specs" on public.world_game_design_specs for insert to authenticated with check((select auth.uid())=created_by and status='draft');
create policy "authenticated read stable or own game specs" on public.world_game_design_specs for select to authenticated using(status='stable' or (select auth.uid())=created_by);
create policy "authenticated read evidence for readable specs" on public.world_game_design_evidence for select to authenticated using(exists(select 1 from public.world_game_design_specs s where s.id=spec_id and (s.status='stable' or s.created_by=(select auth.uid()))));
-- No client policy promotes candidate/stable. Promotion remains server/admin + release evidence only.
