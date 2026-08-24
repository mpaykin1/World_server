create index if not exists voxel_player_states_world_recent_idx on public.voxel_player_states(world_id, updated_at desc);
