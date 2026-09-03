-- V4 TEMPLATE. Desktop AI MUST create the real migration with:
--   supabase migration new world_community_v4
-- Then copy this SQL into the generated file, review current schema, run advisors, apply, test, run advisors again.
-- This migration does NOT create/alter objects inside the locked `realtime` schema. It only calls existing realtime.send().
begin;

create schema if not exists world_private;
revoke all on schema world_private from public, anon, authenticated;

create extension if not exists vector with schema extensions;

create table if not exists public.world_feedback_embeddings (
  feedback_id uuid primary key references public.world_feedback(id) on delete cascade,
  provider text not null,
  model text not null,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.world_feedback_embeddings enable row level security;
revoke all on public.world_feedback_embeddings from anon, authenticated;
create index if not exists world_feedback_embeddings_hnsw on public.world_feedback_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.world_feedback_development_candidates add column if not exists semantic_cluster_key text;
alter table public.world_feedback_development_candidates add column if not exists semantic_provider text;
alter table public.world_feedback_development_candidates add column if not exists public_title text;
alter table public.world_feedback_development_candidates add column if not exists vote_score integer not null default 0;

create table if not exists public.world_feature_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_key text not null,
  vote smallint not null check (vote in (-1,1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,candidate_key)
);
alter table public.world_feature_votes enable row level security;
revoke all on public.world_feature_votes from anon, authenticated;
create index if not exists world_feature_votes_candidate_idx on public.world_feature_votes(candidate_key);

create table if not exists public.world_community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid null references auth.users(id) on delete set null,
  message_id text null,
  world_id text,
  room_id text,
  locale text not null default 'en',
  reason text not null check(reason in ('harassment','hate','sexual','spam','threat','cheating','impersonation','privacy','other')),
  details text check(details is null or length(details)<=1000),
  status text not null default 'new' check(status in ('new','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.world_community_reports enable row level security;
revoke all on public.world_community_reports from anon, authenticated;
create index if not exists world_community_reports_status_idx on public.world_community_reports(status,created_at desc);

create table if not exists public.world_translation_terms (
  id uuid primary key default gen_random_uuid(),
  world_id text not null default 'main',
  canonical_term text not null check(length(canonical_term) between 1 and 200),
  instructions text check(instructions is null or length(instructions)<=1000),
  status text not null default 'approved' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id,canonical_term)
);
alter table public.world_translation_terms enable row level security;
revoke all on public.world_translation_terms from anon, authenticated;

create table if not exists public.world_translation_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  world_id text not null default 'main',
  source_lang text not null,
  target_lang text not null,
  source_text text not null check(length(source_text) between 1 and 4000),
  suggested_translation text not null check(length(suggested_translation) between 1 and 4000),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.world_translation_corrections enable row level security;
revoke all on public.world_translation_corrections from anon, authenticated;
create index if not exists world_translation_corrections_review_idx on public.world_translation_corrections(status,created_at desc);

create table if not exists public.world_chat_messages (
  id uuid primary key default gen_random_uuid(),
  client_message_id text not null,
  world_id text not null,
  room_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check(length(nickname) between 1 and 80),
  source_language text not null default 'en',
  text text not null check(length(text) between 1 and 2000),
  moderation_status text not null default 'visible' check(moderation_status in ('visible','hidden','review')),
  created_at timestamptz not null default now(),
  unique(user_id,client_message_id)
);
alter table public.world_chat_messages enable row level security;
revoke all on public.world_chat_messages from anon, authenticated;
create index if not exists world_chat_room_created_idx on public.world_chat_messages(world_id,room_id,created_at desc);

create or replace function world_private.world_chat_broadcast_v4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'client_message_id', new.client_message_id,
      'world_id', new.world_id,
      'room_id', new.room_id,
      'user_id', new.user_id,
      'nickname', new.nickname,
      'source_language', new.source_language,
      'text', new.text,
      'created_at', new.created_at
    ),
    'chat_message',
    'world:' || new.world_id || ':room:' || new.room_id,
    true
  );
  return null;
end;
$$;
revoke all on function world_private.world_chat_broadcast_v4() from public, anon, authenticated;

drop trigger if exists world_chat_broadcast_v4_trigger on public.world_chat_messages;
create trigger world_chat_broadcast_v4_trigger
after insert on public.world_chat_messages
for each row execute function world_private.world_chat_broadcast_v4();

commit;
