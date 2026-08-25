alter table public.voxel_player_states
  add column if not exists guest_secret_hash text;

alter table public.voxel_player_states
  drop constraint if exists voxel_player_states_guest_secret_hash_check;
alter table public.voxel_player_states
  add constraint voxel_player_states_guest_secret_hash_check
  check (
    guest_secret_hash is null
    or guest_secret_hash ~ '^[0-9a-f]{64}$'
  );

comment on column public.voxel_player_states.guest_secret_hash is
  'SHA-256 of the Voxel-only 256-bit guest credential. Never expose through API responses or Realtime.';
