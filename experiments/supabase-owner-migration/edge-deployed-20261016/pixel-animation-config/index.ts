const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  headers.set('X-Pixel-Animation-Config', 'v3');
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(JSON.stringify(data), { ...init, headers });
}
function getPublicCredential(): { key: string; modern: boolean } {
  const modern = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string,string>;
      const key = parsed.default ?? Object.values(parsed)[0] ?? '';
      if (key) return { key, modern: true };
    } catch { /* legacy fallback */ }
  }
  return { key: Deno.env.get('SUPABASE_ANON_KEY') ?? '', modern: false };
}
async function readTable(baseUrl: string, credential: { key: string; modern: boolean }, table: string, select: string, filter = 'enabled=eq.true') {
  const headers: Record<string,string> = { apikey: credential.key, Accept: 'application/json' };
  if (!credential.modern) headers.Authorization = `Bearer ${credential.key}`;
  const suffix = filter ? `&${filter}` : '';
  const res = await fetch(`${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}${suffix}`, { headers });
  if (!res.ok) throw new Error(`${table}:${res.status}`);
  return await res.json();
}
function validFingerprint(value: string | null) { return Boolean(value && /^[0-9a-f]{6,64}$/.test(value)); }
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405 });
  const baseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const credential = getPublicCredential();
  if (!baseUrl || !credential.key) return json({ error: 'runtime_not_configured' }, { status: 503 });
  const url = new URL(req.url); const fingerprint = url.searchParams.get('fingerprint');
  try {
    const learnedPromise = validFingerprint(fingerprint)
      ? readTable(baseUrl, credential, 'pixel_animation_learned_policy', 'fingerprint,tier,version,policy_patch,evidence,updated_at', `enabled=eq.true&fingerprint=eq.${fingerprint}`)
      : Promise.resolve([]);
    const [profilesRows, policyRows, atlasRows, learnedRows] = await Promise.all([
      readTable(baseUrl, credential, 'pixel_animation_profiles', 'profile_key,version,profile,updated_at'),
      readTable(baseUrl, credential, 'pixel_animation_runtime_policy', 'policy_key,version,policy,updated_at'),
      readTable(baseUrl, credential, 'pixel_animation_atlas_manifests', 'atlas_key,version,texture_url,width,height,manifest,layers,streaming,updated_at'),
      learnedPromise,
    ]);
    const profiles = Object.fromEntries((profilesRows as Array<{ profile_key:string; profile:unknown }>).map(row => [row.profile_key,row.profile]));
    const atlases = Object.fromEntries((atlasRows as Array<{ atlas_key:string }>).map(row => [row.atlas_key,row]));
    const policyRow = (policyRows as Array<{ policy_key:string; version:number; policy:unknown }>).find(row => row.policy_key === 'default');
    const learnedPolicy: Record<string,unknown> = { tiers:{} };
    for (const row of learnedRows as Array<{tier:string;policy_patch:any}>) {
      const patch = row.policy_patch || {}; if (patch.tiers?.[row.tier]) (learnedPolicy.tiers as Record<string,unknown>)[row.tier] = patch.tiers[row.tier];
    }
    if (!Object.keys(learnedPolicy.tiers as object).length) delete learnedPolicy.tiers;
    const version = Math.max(3, ...(profilesRows as Array<{version:number}>).map(row => Number(row.version)||1), Number(policyRow?.version)||1, ...(atlasRows as Array<{version:number}>).map(row => Number(row.version)||1));
    return json({ schema:'pixel-animation-config/v3', version, generatedAt:new Date().toISOString(), capabilities:{ webgpu:true, gpuComputeCulling:true, webgl2:true, textureArrays:true, canvas2d:true, pixi8Adapter:true, offscreenWorker:true, autoAtlas:true, autoProfile:true, regionRig:true, pipelineWarmup:true, visualRegression:true, deviceLearning:true, autoIntegrate:true }, policy:policyRow?.policy??null, learnedPolicy:Object.keys(learnedPolicy).length?learnedPolicy:null, profiles, atlases });
  } catch (error) {
    console.error('[pixel-animation-config:v3]', error);
    return json({ error:'config_unavailable' }, { status:503 });
  }
});
