create or replace function public.quality_validate_pixel_atlas_manifests()
returns jsonb
language sql
security definer
set search_path='public','pg_temp'
as $$
  select jsonb_build_object(
    'valid',count(*) filter(where enabled and (texture_url like 'https://%' or texture_url like '/%') and width>0 and height>0 and jsonb_typeof(manifest)='object' and jsonb_typeof(manifest->'frames') in ('object','array') and jsonb_array_length(case when jsonb_typeof(manifest->'frames')='array' then manifest->'frames' else '[]'::jsonb end) > 0 or (jsonb_typeof(manifest->'frames')='object' and manifest->'frames' <> '{}'::jsonb)) > 0,
    'enabledCount',count(*) filter(where enabled),
    'manifests',coalesce(jsonb_agg(jsonb_build_object('atlasKey',atlas_key,'version',version,'textureUrl',texture_url,'width',width,'height',height,'enabled',enabled,'updatedAt',updated_at) order by atlas_key) filter(where enabled),'[]'::jsonb)
  )
  from public.pixel_animation_atlas_manifests;
$$;

create or replace function public.quality_register_pixel_atlas_manifest(p_atlas jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_key text:=nullif(trim(p_atlas->>'atlasKey'),'');
  v_version integer:=coalesce((p_atlas->>'version')::integer,1);
  v_url text:=nullif(trim(p_atlas->>'textureUrl'),'');
  v_width integer:=coalesce((p_atlas->>'width')::integer,0);
  v_height integer:=coalesce((p_atlas->>'height')::integer,0);
  v_manifest jsonb:=coalesce(p_atlas->'manifest','{}'::jsonb);
  v_layers jsonb:=coalesce(p_atlas->'layers','[]'::jsonb);
  v_streaming jsonb:=coalesce(p_atlas->'streaming','{"enabled":true,"preload":1,"streamAheadPages":2}'::jsonb);
  v_frames jsonb;
  v_frame_count integer:=0;
  v_cycle jsonb;
begin
  if v_key is null or char_length(v_key)<3 or char_length(v_key)>120 then raise exception 'atlasKey invalid'; end if;
  if v_url is null or not (v_url like 'https://%' or v_url like '/%') then raise exception 'textureUrl must be https:// or site-relative / path'; end if;
  if v_width<1 or v_height<1 or v_width>16384 or v_height>16384 then raise exception 'atlas dimensions invalid'; end if;
  if jsonb_typeof(v_manifest)<>'object' then raise exception 'manifest must be object'; end if;
  v_frames:=v_manifest->'frames';
  if jsonb_typeof(v_frames)='array' then v_frame_count:=jsonb_array_length(v_frames);
  elsif jsonb_typeof(v_frames)='object' then select count(*) into v_frame_count from jsonb_object_keys(v_frames);
  else raise exception 'manifest.frames must be non-empty object or array'; end if;
  if v_frame_count<1 then raise exception 'manifest.frames must not be empty'; end if;

  insert into public.pixel_animation_atlas_manifests(atlas_key,version,texture_url,width,height,manifest,enabled,updated_at,layers,streaming)
  values(v_key,v_version,v_url,v_width,v_height,v_manifest,true,now(),v_layers,v_streaming)
  on conflict(atlas_key) do update set version=excluded.version,texture_url=excluded.texture_url,width=excluded.width,height=excluded.height,manifest=excluded.manifest,enabled=true,updated_at=now(),layers=excluded.layers,streaming=excluded.streaming;

  v_cycle:=public.run_gap_closure_db_cycle('pixel-atlas-registered');
  perform public.quality_reconcile_closed_gap_jobs();
  return jsonb_build_object('ok',true,'atlasKey',v_key,'frameCount',v_frame_count,'validation',public.quality_validate_pixel_atlas_manifests(),'gapCycle',v_cycle);
end;
$$;

revoke all on function public.quality_validate_pixel_atlas_manifests() from public,anon,authenticated;
revoke all on function public.quality_register_pixel_atlas_manifest(jsonb) from public,anon,authenticated;
grant execute on function public.quality_validate_pixel_atlas_manifests() to service_role;
grant execute on function public.quality_register_pixel_atlas_manifest(jsonb) to service_role;

select cron.schedule('quality-gap-reconcile-v11','*/5 * * * *',$$select public.quality_reconcile_closed_gap_jobs();$$);
