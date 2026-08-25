-- Unified Autonomous Game Factory v1 hardening: covering indexes required by FK access paths.
create index if not exists factory_asset_dependencies_depends_idx on public.factory_asset_dependencies(depends_on_version_id);
create index if not exists factory_asset_versions_license_idx on public.factory_asset_versions(license_key);
create index if not exists factory_dataset_items_license_idx on public.factory_dataset_items(license_key);
create index if not exists factory_datasets_license_idx on public.factory_datasets(license_key);
create index if not exists factory_disaster_runs_scenario_idx on public.factory_disaster_runs(scenario_key,created_at desc);
create index if not exists factory_knowledge_relations_to_idx on public.factory_knowledge_relations(to_entity_id,relation_kind);
create index if not exists factory_requests_game_spec_idx on public.factory_requests(game_spec_id) where game_spec_id is not null;
create index if not exists quality_worker_jobs_parent_idx on public.quality_worker_jobs(parent_job_id) where parent_job_id is not null;
