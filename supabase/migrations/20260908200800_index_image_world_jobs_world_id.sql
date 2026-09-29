-- Cover the image_world_jobs.world_id foreign key used by world-scoped cleanup/join paths.
create index if not exists image_world_jobs_world_id_idx on public.image_world_jobs(world_id);