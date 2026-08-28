create table if not exists public.pixel_animation_profiles (
  profile_key text primary key,
  version integer not null default 1 check (version > 0),
  profile jsonb not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.pixel_animation_runtime_policy (
  policy_key text primary key,
  version integer not null default 1 check (version > 0),
  policy jsonb not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pixel_animation_profiles enable row level security;
alter table public.pixel_animation_runtime_policy enable row level security;
revoke all on public.pixel_animation_profiles from anon, authenticated;
revoke all on public.pixel_animation_runtime_policy from anon, authenticated;
grant select on public.pixel_animation_profiles to anon, authenticated;
grant select on public.pixel_animation_runtime_policy to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pixel_animation_profiles' and policyname='pixel_animation_profiles_read') then
    create policy pixel_animation_profiles_read on public.pixel_animation_profiles for select to anon, authenticated using (enabled = true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pixel_animation_runtime_policy' and policyname='pixel_animation_runtime_policy_read') then
    create policy pixel_animation_runtime_policy_read on public.pixel_animation_runtime_policy for select to anon, authenticated using (enabled = true);
  end if;
end $$;

insert into public.pixel_animation_profiles(profile_key, version, profile) values
('bird', 1, '{"kind":"bird","motion":{"speed":1.0,"bob":0.018,"sway":0.012,"wingAmplitude":0.065,"wingFrequency":1.8,"tailAmplitude":0.035,"tailFrequency":1.15},"material":{"shimmer":0.16,"glow":0.08,"sparkle":0.12}}'::jsonb),
('fire', 1, '{"kind":"fire","motion":{"speed":1.35,"bob":0.01,"sway":0.045,"waveAmplitude":0.075,"waveFrequency":2.6},"material":{"shimmer":0.34,"glow":0.22,"sparkle":0.18}}'::jsonb),
('water', 1, '{"kind":"water","motion":{"speed":0.72,"bob":0.012,"sway":0.028,"waveAmplitude":0.035,"waveFrequency":1.4},"material":{"shimmer":0.22,"glow":0.03,"sparkle":0.06}}'::jsonb),
('tree', 1, '{"kind":"tree","motion":{"speed":0.42,"sway":0.026,"branchAmplitude":0.035,"branchFrequency":0.62},"material":{"shimmer":0.03,"glow":0.0,"sparkle":0.01}}'::jsonb),
('grass', 1, '{"kind":"grass","motion":{"speed":0.65,"sway":0.052,"branchAmplitude":0.07,"branchFrequency":0.9},"material":{"shimmer":0.02,"glow":0.0,"sparkle":0.0}}'::jsonb),
('flag', 1, '{"kind":"flag","motion":{"speed":0.88,"sway":0.018,"waveAmplitude":0.075,"waveFrequency":1.65},"material":{"shimmer":0.04,"glow":0.0,"sparkle":0.0}}'::jsonb),
('monster', 1, '{"kind":"monster","motion":{"speed":0.92,"bob":0.022,"sway":0.012,"breathAmplitude":0.018,"breathFrequency":0.82},"material":{"shimmer":0.04,"glow":0.025,"sparkle":0.01}}'::jsonb),
('machine', 1, '{"kind":"machine","motion":{"speed":1.0,"vibration":0.006,"vibrationFrequency":4.2},"material":{"shimmer":0.08,"glow":0.055,"sparkle":0.025}}'::jsonb),
('glass', 1, '{"kind":"glass","motion":{"speed":0.45},"material":{"shimmer":0.3,"glow":0.09,"sparkle":0.2}}'::jsonb)
on conflict (profile_key) do update set version=excluded.version, profile=excluded.profile, enabled=true, updated_at=now();

insert into public.pixel_animation_runtime_policy(policy_key, version, policy) values
('default', 1, '{"targetFps":60,"backendOrder":["webgpu","webgl2","canvas2d"],"pixelPerfect":true,"nearestFiltering":true,"pauseWhenHidden":true,"tiers":{"ultra":{"maxVisible":20000,"fullAnimation":5000,"mediumAnimation":10000,"resolutionScale":1.0,"farUpdateHz":20,"maxDpr":2.0},"high":{"maxVisible":12000,"fullAnimation":3000,"mediumAnimation":6500,"resolutionScale":1.0,"farUpdateHz":15,"maxDpr":1.75},"medium":{"maxVisible":7000,"fullAnimation":1600,"mediumAnimation":3500,"resolutionScale":0.85,"farUpdateHz":12,"maxDpr":1.5},"low":{"maxVisible":3500,"fullAnimation":700,"mediumAnimation":1600,"resolutionScale":0.7,"farUpdateHz":8,"maxDpr":1.25}},"adaptive":{"sampleWindowMs":1200,"downshiftBelowFps":52,"upshiftAboveFps":58,"downshiftHoldMs":1800,"upshiftHoldMs":8000}}'::jsonb)
on conflict (policy_key) do update set version=excluded.version, policy=excluded.policy, enabled=true, updated_at=now();
