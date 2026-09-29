import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function resolveAdminKey(): string {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      const candidate = parsed.default ?? Object.values(parsed)[0];
      if (typeof candidate === "string") return candidate;
      if (candidate && typeof candidate === "object" && typeof candidate.key === "string") return candidate.key;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const adminKey = resolveAdminKey();
const supabase = createClient(SUPABASE_URL, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const ALLOWED = new Set([
  "world_server_acquire_lease",
  "world_server_renew_lease",
  "world_server_release_lease",
  "world_server_fenced_migration_probe",
]);
async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function authorized(req: Request): Promise<boolean> {
  if (!adminKey || !SUPABASE_URL) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase
    .from("world_server_cas_config")
    .select("value")
    .eq("key", "leader_bearer_sha256")
    .single();
  return !error && typeof data?.value === "string" && data.value === tokenHash;
}
Deno.serve(async (req: Request) => {
  try {
    if (!(await authorized(req))) return json(401, { ok: false, error: "unauthorized" });
    const pathname = new URL(req.url).pathname.replace(/\/$/, "");
    const action = pathname.split("/").pop() ?? "";
    if (req.method === "GET" && action === "health") {
      return json(200, {
        ok: true,
        backend: "supabase-rpc",
        fencing: true,
        region: Deno.env.get("SB_REGION") ?? null,
      });
    }
    if (req.method !== "POST" || !ALLOWED.has(action)) {
      return json(404, { ok: false, error: "not-found" });
    }
    const body = await req.json().catch(() => ({}));
    const { data, error } = await supabase.rpc(action, body);
    if (error) return json(400, { ok: false, error: "rpc-failed", code: error.code ?? null });
    return json(200, data);
  } catch (error) {
    console.error("world-server-lease-canary", error instanceof Error ? error.message : String(error));
    return json(500, { ok: false, error: "internal" });
  }
});
