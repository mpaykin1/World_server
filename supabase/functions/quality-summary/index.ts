import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-world-server-quality-runtime": "supabase-edge" } });
}
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
  const requestUrl = new URL(req.url);
  const hours = Math.max(1, Math.min(Number(requestUrl.searchParams.get("hours") || 24), 168));
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Quality backend unavailable" }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from("quality_telemetry")
      .select("created_at,app,event_type,load_ms,dom_ms,fps,error_count,coarse")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
    if (error) throw error;
    const groups: Record<string, {sessions:number;fps:number[];load:number[];dom:number[];errors:number;mobileSessions:number}> = {};
    for (const row of data || []) {
      const app = String(row.app || "unknown");
      const g = groups[app] ||= { sessions: 0, fps: [], load: [], dom: [], errors: 0, mobileSessions: 0 };
      if (row.event_type === "quality_session") {
        g.sessions++;
        if (Number.isFinite(row.fps)) g.fps.push(Number(row.fps));
        if (Number.isFinite(row.load_ms)) g.load.push(Number(row.load_ms));
        if (Number.isFinite(row.dom_ms)) g.dom.push(Number(row.dom_ms));
        g.errors += Number(row.error_count || 0);
        if (row.coarse === true) g.mobileSessions++;
      } else if (row.event_type === "client_error" || row.event_type === "unhandled_rejection") g.errors++;
    }
    const apps: Record<string, unknown> = {};
    for (const [app, g] of Object.entries(groups)) apps[app] = {
      sessions: g.sessions,
      avgFps: g.fps.length ? Math.round(g.fps.reduce((a,b)=>a+b,0)/g.fps.length) : null,
      p10Fps: percentile(g.fps, .10),
      avgLoadMs: g.load.length ? Math.round(g.load.reduce((a,b)=>a+b,0)/g.load.length) : null,
      p95LoadMs: percentile(g.load, .95), p95DomMs: percentile(g.dom, .95), errors: g.errors, mobileSessions: g.mobileSessions
    };
    const body = { ok: true, hours, since, apps };
    if (req.method === "HEAD") return new Response(null, { status: 200, headers: { "cache-control": "no-store", "x-world-server-quality-runtime": "supabase-edge" } });
    return json(body);
  } catch (error) {
    console.error("[quality-summary]", error);
    return json({ ok: false, error: "Quality summary unavailable" }, 503);
  }
});
