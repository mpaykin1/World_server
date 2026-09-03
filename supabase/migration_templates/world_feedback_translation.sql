-- TEMPLATE. Desktop AI: run `supabase migration new world_feedback_translation_v3`, then copy this SQL into the generated file.
-- Do not invent a migration filename. Run advisors before/after applying.
begin;
create table if not exists public.world_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid null references auth.users(id) on delete set null,
  client_event_id text not null unique, content_hash text not null, session_id text, world_id text, build_sha text, platform text, locale text not null default 'en',
  category text not null check(category in ('bug','idea','gameplay','graphics','performance','multiplayer','navigator','accessibility','localization','other')),
  rating smallint check(rating between 1 and 5), severity text not null default 'medium' check(severity in ('low','medium','high','critical')),
  message text not null check(length(message) between 3 and 4000), source text not null default 'in_app', public_consent boolean not null default false,
  status text not null default 'new' check(status in ('new','triaged','planned','in_progress','shipped','wont_fix','duplicate')), duplicate_of uuid references public.world_feedback(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.world_feedback enable row level security;
revoke all on public.world_feedback from anon, authenticated;
grant select on public.world_feedback to authenticated;
drop policy if exists "feedback owner can read own submissions" on public.world_feedback;
create policy "feedback owner can read own submissions" on public.world_feedback for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.world_translation_cache (
  source_hash text primary key, source_lang text not null, target_lang text not null, provider text not null, provider_version text,
  translation text not null, hits bigint not null default 1, created_at timestamptz not null default now(), last_used_at timestamptz not null default now()
);
alter table public.world_translation_cache enable row level security;
revoke all on public.world_translation_cache from anon, authenticated;

create table if not exists public.world_feedback_development_candidates (
  cluster_key text primary key, title text not null, category text not null, occurrences integer not null default 1, priority_score integer not null,
  status text not null default 'candidate' check(status in ('candidate','accepted','planned','in_progress','shipped','rejected')),
  evidence jsonb not null default '[]'::jsonb, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
alter table public.world_feedback_development_candidates enable row level security;
revoke all on public.world_feedback_development_candidates from anon, authenticated;

create index if not exists world_feedback_created_idx on public.world_feedback(created_at desc);
create index if not exists world_feedback_category_status_idx on public.world_feedback(category,status,created_at desc);
commit;
