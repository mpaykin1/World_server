alter table public.voxel_block_overrides drop constraint if exists voxel_block_overrides_block_type_check;
alter table public.voxel_block_overrides add constraint voxel_block_overrides_block_type_check check (block_type between 0 and 13);
alter table public.voxel_player_states drop constraint if exists voxel_player_states_selected_block_check;
alter table public.voxel_player_states add constraint voxel_player_states_selected_block_check check (selected_block between 0 and 13);
