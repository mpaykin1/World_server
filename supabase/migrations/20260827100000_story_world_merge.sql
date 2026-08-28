-- Backend for the improve-world-home questionnaire -> world creation -> merge
-- pipeline (see WORK_IN_PROGRESS.md track B). Reuses this project's existing
-- conventions rather than inventing new ones:
--   * dual owner_user_id/owner_guest_id ownership, same shape as
--     game_player_states/sharabass_objects/survival_buildings/voxel_player_states
--     (guest_id is a client-generated UUID validated at the application layer
--     by lib/auth.js#optionalIdentity, not a signed/verified credential --
--     matching the existing pattern exactly, not inventing a new identity model).
--   * RLS enabled on every table; anon/authenticated get only the narrowest
--     read they need (worlds: published rows only), everything else is
--     server-only (service_role bypasses RLS), matching game_player_states'
--     "fully locked" precedent and quality_telemetry's "RLS enabled, zero
--     policies" precedent.
--   * FKs to public.profiles(id) (not auth.users(id) directly), matching 5 of
--     the 6 existing game_* tables' convention rather than voxel_block_overrides'
--     inconsistent auth.users(id) reference.
--
-- Deliberately NOT included here: a `create table if not exists public.profiles`
-- bootstrap. That gap (profiles is only ever ALTERed, never CREATEd, in this
-- migration history -- see 20260819055525_world_game_backend.sql) is real and
-- already documented in WORK_IN_PROGRESS.md, but fixing it requires a
-- migration dated *before* 20260819055525 to make a from-zero replay work,
-- which means renumbering already-applied production migration history --
-- a separate, carefully-sequenced fix, not bundled into an unrelated feature.
-- This migration's FKs to profiles(id) work today because profiles already
-- exists in the live project (confirmed via public REST probe: GET
-- .../rest/v1/profiles returns 200, zero rows).

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id),
  owner_guest_id uuid,
  journey text not null check (journey in ('create', 'join')),
  source_story_id uuid references public.stories(id),
  answers jsonb not null default '{}'::jsonb,
  blueprint jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stories_owner_identity check (owner_user_id is not null or owner_guest_id is not null)
);

create index if not exists stories_owner_user_id_idx on public.stories (owner_user_id) where owner_user_id is not null;
create index if not exists stories_owner_guest_id_idx on public.stories (owner_guest_id) where owner_guest_id is not null;
create index if not exists stories_source_story_id_idx on public.stories (source_story_id) where source_story_id is not null;

alter table public.stories enable row level security;
-- Server-only: ownership is enforced at the application layer (matches
-- optionalIdentity()'s userId-or-guestId model -- guest_id isn't verifiable
-- via auth.uid(), so RLS can't safely grant per-row anon/authenticated access
-- the way it does for a real auth.uid()-backed owner column).
revoke all on public.stories from anon, authenticated;

create table if not exists public.worlds (
  id text primary key,
  source_story_ids uuid[] not null default '{}',
  spec jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  public_slug text unique,
  owner_user_id uuid references public.profiles(id),
  owner_guest_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worlds_owner_identity check (owner_user_id is not null or owner_guest_id is not null)
);

create index if not exists worlds_owner_user_id_idx on public.worlds (owner_user_id) where owner_user_id is not null;
create index if not exists worlds_owner_guest_id_idx on public.worlds (owner_guest_id) where owner_guest_id is not null;
create index if not exists worlds_status_idx on public.worlds (status);

alter table public.worlds enable row level security;
-- A published world must be openable by a brand-new clean/incognito visitor
-- with no account at all -- this is the one table in this migration that
-- needs a real anon-read policy, mirroring voxel_worlds' public-read precedent.
create policy "published worlds are publicly readable" on public.worlds
  for select to anon, authenticated
  using (status = 'published');
revoke insert, update, delete on public.worlds from anon, authenticated;

create table if not exists public.merges (
  id uuid primary key default gen_random_uuid(),
  source_world_ids text[] not null,
  result_world_id text references public.worlds (id),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merges_min_sources check (array_length(source_world_ids, 1) >= 2)
);

create index if not exists merges_result_world_id_idx on public.merges (result_world_id) where result_world_id is not null;

alter table public.merges enable row level security;
-- Merges are an internal operation; the resulting world becomes visible once
-- its own row's status flips to 'published' via the policy above.
revoke all on public.merges from anon, authenticated;
