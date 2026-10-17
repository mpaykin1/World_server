import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
function clamp(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
}
function text(value: unknown, max: number) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function cleanOrigin(value: unknown) { try { const u = new URL(String(value || "")); return u.protocol === "https:" && !u.username && !u.password ? u.origin.slice(0, 240) : null; } catch { return null; } }

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 16384) return json({ error: "Payload too large" }, 413);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const row = {
    app: text(body.app || "unknown", 64) || "unknown",
    event_type: text(body.type || "unknown", 64) || "unknown",
    path: text(body.path, 160),
    load_ms: clamp(body.loadMs, 0, 120000),
    dom_ms: clamp(body.domMs, 0, 120000),
    fps: clamp(body.fps, 0, 240),
    error_count: clamp(body.errors, 0, 1000),
    coarse: typeof body.coarse === "boolean" ? body.coarse : null,
    viewport_w: Array.isArray(body.viewport) ? clamp(body.viewport[0], 1, 10000) : null,
    viewport_h: Array.isArray(body.viewport) ? clamp(body.viewport[1], 1, 10000) : null,
    dpr: clamp(body.dpr, .25, 8),
    message: body.message ? text(body.message, 240) : null,
    release_sha: text(req.headers.get("x-world-server-release-sha"), 80) || null,
    deployment_url: cleanOrigin(req.headers.get("x-world-server-deployment-url")),
  };
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Telemetry backend unavailable" }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.from("quality_telemetry").insert(row);
    if (error) throw error;
    return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-world-server-quality-runtime": "supabase-edge" } });
  } catch (error) {
    console.error("[quality-telemetry]", error);
    return json({ error: "Telemetry persist failed" }, 503);
  }
});
