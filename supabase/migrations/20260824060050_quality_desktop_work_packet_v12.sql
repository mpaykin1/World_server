create or replace function public.quality_pixel_atlas_status()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
select jsonb_build_object(
  'profiles',(select count(*) from public.pixel_animation_profiles where enabled),
  'enabledAtlases',(select count(*) from public.pixel_animation_atlas_manifests where enabled),
  'latestAtlas',(select jsonb_build_object('atlasKey',atlas_key,'version',version,'textureUrl',texture_url,'width',width,'height',height,'updatedAt',updated_at) from public.pixel_animation_atlas_manifests where enabled order by updated_at desc limit 1),
  'ready',exists(select 1 from public.pixel_animation_atlas_manifests where enabled)
);
$$;
revoke all on function public.quality_pixel_atlas_status() from public, anon, authenticated;
grant execute on function public.quality_pixel_atlas_status() to service_role;

select public.quality_record_external_control(
  'github.oidc.bridge.unauthorized-denied',true,'chatgpt-supabase-negative-test',
  jsonb_build_object('edgeFunction','quality-github-bridge','requestId',16,'expectedStatus',401,'observedStatus',401,'verifiedAt',now())
);

create or replace function public.quality_desktop_ai_work_packet()
returns jsonb
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object(
    'version','2026-08-24.v12.2',
    'generatedAt',now(),
    'runtime',public.quality_runtime_status(),
    'runtimeScore',public.quality_runtime_score(),
    'schemaDrift',public.quality_schema_drift_status(),
    'migrationDigest',public.quality_migration_history_digest(),
    'security',public.quality_security_definer_status(),
    'externalControls',public.quality_external_controls_status(),
    'githubBridge',public.quality_github_bridge_status(),
    'realDevices',public.quality_real_device_status(),
    'pixelAtlas',public.quality_pixel_atlas_status(),
    'jobs',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'jobKey',job_key,'kind',kind,'priority',priority,'requiredCapabilities',required_capabilities,
      'payload',payload,'status',status,'attempts',attempts,'maxAttempts',max_attempts,
      'leaseOwner',lease_owner,'leaseExpiresAt',lease_expires_at,'updatedAt',updated_at
    ) order by priority desc,created_at asc),'[]'::jsonb)
    from public.quality_worker_jobs where status in ('queued','running','failed')),
    'gaps',(select coalesce(jsonb_agg(jsonb_build_object(
      'gapKey',gap_key,'domain',domain,'severity',severity,'title',title,'description',description,'status',status,
      'autoFixable',auto_fixable,'attempts',attempts,'maxAttempts',max_attempts,'evidence',evidence,
      'fixStrategy',fix_strategy,'lastError',last_error,'lastSeenAt',last_seen_at
    ) order by case severity when 'blocker' then 4 when 'major' then 3 when 'warning' then 2 else 1 end desc,last_seen_at desc),'[]'::jsonb)
    from public.gap_closure_registry where status<>'closed'),
    'rules',jsonb_build_array(
      'Read AGENTS.md and DESKTOP_AI_INSTALL_AND_VERIFY.md before editing.',
      'Create or update WORK_IN_PROGRESS.md before changing project files.',
      'Claim one compatible quality job at a time and preserve its job id.',
      'After 2-3 failed attempts, change strategy and inspect evidence/logs instead of repeating the same action.',
      'Do not stop while a reproducible in-scope error remains unfixed or a changed behavior remains unverified.',
      'Every confirmed fix must add or update regression protection where technically possible.',
      'Never push directly to master; use a task branch and PR.',
      'Never fabricate physical-device, pixel-atlas, GitHub-protection, deployment, or runtime evidence.',
      'Use GitHub Actions OIDC bridge instead of storing a long-lived Supabase service key when the V12 workflow is available.',
      'Run release:gate plus relevant browser/runtime tests before marking a job complete.',
      'After merging schema changes, record the actual master SHA plus exact migration filenames and require schemaDrift.drift=false.',
      'Master protection is not PASS until fresh GitHub API evidence says protected=true.',
      'Re-read this work packet after every completed job until no compatible actionable jobs remain.',
      'If an external permission blocks progress, record the blocker, try a different safe route, and continue with all other actionable work.'
    )
  );
$$;
revoke all on function public.quality_desktop_ai_work_packet() from public, anon, authenticated;
grant execute on function public.quality_desktop_ai_work_packet() to service_role;

update private.quality_runtime_state set version='2026-08-24.v12.2',updated_at=now() where singleton=true;
