-- Extend the existing public, PII-free canon ledger for authored causal chains.
-- No second event store is introduced. Raw auth / Telegram identifiers remain
-- private; only a one-way stable actor reference is public.

alter table public.world_canon_events
  add column if not exists revision bigint generated always as identity;
alter table public.world_canon_events
  add column if not exists parent_event_key text references public.world_canon_events(event_key) on delete restrict;
alter table public.world_canon_events
  add column if not exists actor_ref text not null default 'legacy';
alter table public.world_canon_events
  add column if not exists source_platform text not null default 'world_server';
alter table public.world_canon_events
  add column if not exists visibility_scope text not null default 'public';

create unique index if not exists world_canon_events_revision_uidx
  on public.world_canon_events(revision);
create index if not exists world_canon_events_parent_idx
  on public.world_canon_events(parent_event_key) where parent_event_key is not null;
create index if not exists world_canon_events_actor_time_idx
  on public.world_canon_events(actor_ref, created_at desc);

alter table public.world_canon_events
  add constraint world_canon_actor_ref_shape
  check (actor_ref = 'legacy' or actor_ref ~ '^actor-[0-9a-f]{24}$') not valid;
alter table public.world_canon_events
  validate constraint world_canon_actor_ref_shape;

alter table public.world_canon_events
  add constraint world_canon_source_platform_shape
  check (source_platform in ('browser', 'telegram', 'world_server')) not valid;
alter table public.world_canon_events
  validate constraint world_canon_source_platform_shape;

alter table public.world_canon_events
  add constraint world_canon_visibility_scope_shape
  check (visibility_scope = 'public') not valid;
alter table public.world_canon_events
  validate constraint world_canon_visibility_scope_shape;

-- Legacy cross-world cause links predate the explicit continuation field.
-- New source continuations set both fields; existing consequence semantics stay
-- untouched and replayable.
comment on column public.world_canon_events.parent_event_key is
  'Same-ledger causal parent for human continuation; validated as same-world by the authoritative API.';
comment on column public.world_canon_events.actor_ref is
  'Public one-way pseudonymous actor reference; never a raw auth or Telegram identifier.';

-- Canon is append-only. Public writes already go through service-role adapters,
-- but this trigger also prevents a future privileged code path from silently
-- rewriting authorship, payload or causal history on an idempotency conflict.
create or replace function public.reject_world_canon_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'world_canon_events is append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists world_canon_events_immutable_mutation on public.world_canon_events;
create trigger world_canon_events_immutable_mutation
before update or delete on public.world_canon_events
for each row execute function public.reject_world_canon_event_mutation();

revoke update, delete on table public.world_canon_events from anon, authenticated;
