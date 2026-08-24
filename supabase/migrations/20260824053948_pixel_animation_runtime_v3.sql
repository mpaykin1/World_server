alter table public.pixel_animation_atlas_manifests
  add column if not exists layers jsonb not null default '[]'::jsonb,
  add column if not exists streaming jsonb not null default '{"enabled":true,"preload":1,"streamAheadPages":2}'::jsonb;

create table if not exists public.pixel_animation_device_baselines (
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{6,64}$'),
  backend text not null check (backend in ('webgpu','webgl2','canvas2d','unknown')),
  tier text not null check (tier in ('low','medium','high','ultra')),
  sample_count integer not null check (sample_count >= 1 and sample_count <= 1000000),
  p10_fps real not null check (p10_fps >= 0 and p10_fps <= 1000),
  p50_fps real not null check (p50_fps >= 0 and p50_fps <= 1000),
  p90_fps real not null check (p90_fps >= 0 and p90_fps <= 1000),
  avg_fps real not null check (avg_fps >= 0 and avg_fps <= 1000),
  max_visible integer not null default 0 check (max_visible >= 0 and max_visible <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (fingerprint, backend, tier)
);

alter table public.pixel_animation_device_baselines enable row level security;
revoke all on public.pixel_animation_device_baselines from anon, authenticated;

create table if not exists public.pixel_animation_learned_policy (
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{6,64}$'),
  tier text not null check (tier in ('low','medium','high','ultra')),
  version integer not null default 1 check (version > 0),
  policy_patch jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (fingerprint, tier)
);

alter table public.pixel_animation_learned_policy enable row level security;
revoke all on public.pixel_animation_learned_policy from anon, authenticated;
grant select on public.pixel_animation_learned_policy to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pixel_animation_learned_policy' and policyname='pixel_animation_learned_policy_read') then
    create policy pixel_animation_learned_policy_read on public.pixel_animation_learned_policy
      for select to anon, authenticated using (enabled = true);
  end if;
end $$;

create index if not exists pixel_animation_device_baselines_updated_idx
  on public.pixel_animation_device_baselines (updated_at desc);
create index if not exists pixel_animation_learned_policy_updated_idx
  on public.pixel_animation_learned_policy (updated_at desc);

insert into public.pixel_animation_runtime_policy(policy_key, version, policy) values
('default', 3, '{
  "targetFps":60,
  "backendOrder":["webgpu","webgl2","canvas2d"],
  "pixelPerfect":true,
  "nearestFiltering":true,
  "pauseWhenHidden":true,
  "features":{"pixi8Adapter":true,"autoAtlas":true,"autoProfile":true,"worker":true,"gpuComputeCulling":true,"multiAtlasStreaming":true,"regionRig":true,"pipelineWarmup":true,"visualRegression":true,"deviceLearning":true,"autoIntegrate":true},
  "computeCulling":{"minObjects":1500,"tiers":["high","ultra"]},
  "atlas":{"padding":2,"maxSize":4096,"maxLayers":16,"streamAheadPages":2},
  "rig":{"enabled":true,"softness":0.03},
  "learning":{"enabled":true,"minSamples":20,"maxPolicyDelta":0.15},
  "visualRegression":{"frames":8,"stepMs":83,"tolerance":0.015},
  "tiers":{
    "ultra":{"maxVisible":26000,"fullAnimation":6500,"mediumAnimation":13000,"resolutionScale":1.0,"farUpdateHz":20,"maxDpr":2.0},
    "high":{"maxVisible":16000,"fullAnimation":4000,"mediumAnimation":8500,"resolutionScale":1.0,"farUpdateHz":16,"maxDpr":1.75},
    "medium":{"maxVisible":8500,"fullAnimation":2000,"mediumAnimation":4500,"resolutionScale":0.85,"farUpdateHz":12,"maxDpr":1.5},
    "low":{"maxVisible":4200,"fullAnimation":900,"mediumAnimation":2000,"resolutionScale":0.70,"farUpdateHz":8,"maxDpr":1.25}
  },
  "adaptive":{"sampleWindowMs":1000,"downshiftBelowFps":52,"upshiftAboveFps":58,"downshiftHoldMs":1500,"upshiftHoldMs":7000},
  "benchmarks":{"warmupMs":800,"sampleMs":3000,"desktopTargets":[1000,5000,10000,20000,30000],"mobileTargets":[500,1500,3000,6000,9000]}
}'::jsonb)
on conflict (policy_key) do update set version=excluded.version, policy=excluded.policy, enabled=true, updated_at=now();
