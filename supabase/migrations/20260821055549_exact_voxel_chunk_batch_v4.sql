create or replace function public.voxel_get_chunk_overrides_batch(
  p_world_id text,
  p_chunks jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with requested as (
    select distinct q.cx, q.cz
    from jsonb_to_recordset(coalesce(p_chunks, '[]'::jsonb)) as q(cx integer, cz integer)
    where q.cx between -62500 and 62500
      and q.cz between -62500 and 62500
    limit 32
  ), matched as (
    select b.cx, b.cz, b.x, b.y, b.z, b.block_type, b.updated_at
    from public.voxel_block_overrides b
    join requested q on q.cx = b.cx and q.cz = b.cz
    where b.world_id = p_world_id
    order by b.cx, b.cz, b.x, b.y, b.z
    limit 10001
  ), limited as (
    select * from matched limit 10000
  )
  select jsonb_build_object(
    'blocks', coalesce((select jsonb_agg(to_jsonb(l)) from limited l), '[]'::jsonb),
    'truncated', (select count(*) > 10000 from matched)
  );
$$;
revoke all on function public.voxel_get_chunk_overrides_batch(text,jsonb) from public;
revoke all on function public.voxel_get_chunk_overrides_batch(text,jsonb) from anon;
revoke all on function public.voxel_get_chunk_overrides_batch(text,jsonb) from authenticated;
grant execute on function public.voxel_get_chunk_overrides_batch(text,jsonb) to service_role;
