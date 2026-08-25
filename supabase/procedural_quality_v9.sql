create table if not exists public.procedural_quality_repair_cycles(
 id uuid primary key default gen_random_uuid(),schema_version integer not null default 9,cycle integer not null default 0,status text not null,
 issues jsonb not null default '[]'::jsonb,repairs jsonb not null default '[]'::jsonb,checks jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table public.procedural_quality_repair_cycles enable row level security;
create index if not exists pqr_v9_status_time on public.procedural_quality_repair_cycles(status,created_at desc);
create table if not exists public.procedural_quality_renderer_capabilities(
 id uuid primary key default gen_random_uuid(),schema_version integer not null default 9,app_path text not null,renderer_type text not null,native_gbuffer boolean not null default false,
 exact_motion boolean not null default false,scene_radiance boolean not null default false,capabilities jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table public.procedural_quality_renderer_capabilities enable row level security;
create index if not exists pqrc_v9_app_time on public.procedural_quality_renderer_capabilities(app_path,created_at desc);
create table if not exists public.procedural_quality_promotions(
 id uuid primary key default gen_random_uuid(),schema_version integer not null default 9,scene text not null,device_class text not null,state text not null default 'candidate',
 score double precision not null default 0,baseline_id uuid,evidence jsonb not null default '{}'::jsonb,settings jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
alter table public.procedural_quality_promotions enable row level security;
create index if not exists pqp_v9_scene_state on public.procedural_quality_promotions(scene,device_class,state,score desc,created_at desc);
