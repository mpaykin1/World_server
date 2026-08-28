begin;
alter table public.quality_canary_runtime_state add column if not exists consecutive_passes integer not null default 0 check (consecutive_passes between 0 and 100);
commit;
