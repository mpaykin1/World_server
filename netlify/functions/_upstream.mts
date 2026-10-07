function env(name) {
  return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || '').trim();
}

export function hasPublicSupabase() {
  return Boolean(
    (env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')) &&
    (env('SUPABASE_PUBLISHABLE_KEY') || env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
  );
}

export function hasAdminSupabase() {
  return hasPublicSupabase() && Boolean(env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'));
}

export async function proxyCanonical(request, path) {
  const origin = env('WORLD_SERVER_API_ORIGIN') || 'https://world-server.vercel.app';
  const target = new URL(path, origin);
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const init = { method: request.method, headers, signal: AbortSignal.timeout(12000) };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.text();
  try {
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get('content-type');
    if (upstreamType) responseHeaders.set('content-type', upstreamType);
    responseHeaders.set('cache-control', 'no-store');
    responseHeaders.set('x-world-server-backend', 'canonical-upstream');
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: 'Canonical backend temporarily unavailable.' }, {
      status: 503,
      headers: { 'cache-control': 'no-store', 'x-world-server-backend': 'offline-fallback-required' }
    });
  }
}
