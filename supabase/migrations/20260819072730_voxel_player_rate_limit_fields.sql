alter table public.voxel_player_states add column if not exists last_block_at timestamptz null;
alter table public.voxel_player_states add column if not exists last_save_at timestamptz null;
