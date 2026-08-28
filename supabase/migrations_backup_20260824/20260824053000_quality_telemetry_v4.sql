-- WORLD SERVER PWA V4 richer privacy-minimal quality telemetry.
-- No user id, account id, IP, raw user-agent, email, or free-form personal data.
alter table public.quality_telemetry
  add column if not exists quality_profile text,
  add column if not exists capability_class text,
  add column if not exists frame_p95_ms integer,
  add column if not exists input_latency_p95_ms integer,
  add column if not exists jank_rate numeric,
  add column if not exists long_task_ms integer,
  add column if not exists heap_mb numeric,
  add column if not exists webgl_context_losses integer,
  add column if not exists stutter_score numeric,
  add column if not exists ios_webkit boolean,
  add column if not exists standalone_pwa boolean;

create index if not exists quality_telemetry_profile_learning_idx
  on public.quality_telemetry(app, capability_class, created_at desc)
  where event_type in ('pwa_quality','runtime_stutter');

comment on column public.quality_telemetry.capability_class is
  'Coarse performance tier only: performance/balanced/high/ultra. Not a device identifier.';
comment on column public.quality_telemetry.ios_webkit is
  'Boolean runtime family signal used for aggregate iPhone/iPad quality evidence. Raw user agent is not stored.';
