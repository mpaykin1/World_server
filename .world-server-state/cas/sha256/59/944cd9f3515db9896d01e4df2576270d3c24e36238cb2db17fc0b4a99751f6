create table if not exists public.pixel_animation_atlas_manifests (
  atlas_key text primary key,
  version integer not null default 1 check (version > 0),
  texture_url text not null,
  width integer not null check (width > 0 and width <= 16384),
  height integer not null check (height > 0 and height <= 16384),
  manifest jsonb not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pixel_animation_atlas_manifests enable row level security;
revoke all on public.pixel_animation_atlas_manifests from anon, authenticated;
grant select on public.pixel_animation_atlas_manifests to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pixel_animation_atlas_manifests' and policyname='pixel_animation_atlas_read') then
    create policy pixel_animation_atlas_read on public.pixel_animation_atlas_manifests for select to anon, authenticated using (enabled = true);
  end if;
end $$;

insert into public.pixel_animation_profiles(profile_key, version, profile) values
('character', 2, '{"kind":"character","motion":{"speed":0.9,"bob":0.01,"sway":0.006,"breathAmplitude":0.012,"breathFrequency":0.7},"material":{"shimmer":0.035,"glow":0.015,"sparkle":0.005}}'::jsonb),
('cloth', 2, '{"kind":"cloth","motion":{"speed":0.8,"sway":0.018,"waveAmplitude":0.06,"waveFrequency":1.45},"material":{"shimmer":0.025,"glow":0.0,"sparkle":0.0}}'::jsonb),
('smoke', 2, '{"kind":"smoke","motion":{"speed":0.55,"bob":0.028,"sway":0.04,"waveAmplitude":0.05,"waveFrequency":1.1},"material":{"shimmer":0.04,"glow":0.02,"sparkle":0.0}}'::jsonb),
('foliage', 2, '{"kind":"foliage","motion":{"speed":0.5,"sway":0.035,"branchAmplitude":0.045,"branchFrequency":0.75},"material":{"shimmer":0.025,"glow":0.0,"sparkle":0.005}}'::jsonb),
('vehicle', 2, '{"kind":"vehicle","motion":{"speed":1.0,"vibration":0.0025,"vibrationFrequency":5.5},"material":{"shimmer":0.045,"glow":0.025,"sparkle":0.01}}'::jsonb),
('weapon', 2, '{"kind":"weapon","motion":{"speed":1.0,"vibration":0.0015,"vibrationFrequency":6.5},"material":{"shimmer":0.065,"glow":0.02,"sparkle":0.02}}'::jsonb),
('portal', 2, '{"kind":"portal","motion":{"speed":0.95,"waveAmplitude":0.025,"waveFrequency":1.8},"material":{"shimmer":0.24,"glow":0.2,"sparkle":0.22}}'::jsonb),
('light', 2, '{"kind":"light","motion":{"speed":1.15,"waveAmplitude":0.012,"waveFrequency":2.4},"material":{"shimmer":0.22,"glow":0.28,"sparkle":0.14}}'::jsonb)
on conflict (profile_key) do update set version=excluded.version, profile=excluded.profile, enabled=true, updated_at=now();

insert into public.pixel_animation_runtime_policy(policy_key, version, policy) values
('default', 2, '{"targetFps":60,"backendOrder":["webgpu","webgl2","canvas2d"],"pixelPerfect":true,"nearestFiltering":true,"pauseWhenHidden":true,"features":{"pixi8Adapter":true,"autoAtlas":true,"autoProfile":true,"worker":true},"tiers":{"ultra":{"maxVisible":24000,"fullAnimation":6000,"mediumAnimation":12000,"resolutionScale":1.0,"farUpdateHz":20,"maxDpr":2.0},"high":{"maxVisible":14000,"fullAnimation":3500,"mediumAnimation":7500,"resolutionScale":1.0,"farUpdateHz":15,"maxDpr":1.75},"medium":{"maxVisible":8000,"fullAnimation":1800,"mediumAnimation":4000,"resolutionScale":0.85,"farUpdateHz":12,"maxDpr":1.5},"low":{"maxVisible":4000,"fullAnimation":800,"mediumAnimation":1800,"resolutionScale":0.7,"farUpdateHz":8,"maxDpr":1.25}},"adaptive":{"sampleWindowMs":1000,"downshiftBelowFps":52,"upshiftAboveFps":58,"downshiftHoldMs":1500,"upshiftHoldMs":7000},"atlas":{"padding":2,"maxSize":4096,"powerOfTwo":false},"benchmarks":{"warmupMs":800,"sampleMs":3000,"desktopTargets":[1000,5000,10000,20000],"mobileTargets":[500,1500,3000,6000]}}'::jsonb)
on conflict (policy_key) do update set version=excluded.version, policy=excluded.policy, enabled=true, updated_at=now();
