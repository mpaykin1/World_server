import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const MAX_BYTES = 1024 * 1024;

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

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
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
  const tokenHash = await sha256Hex(token);  const { data, error } = await supabase
    .from("world_server_cas_config")
    .select("value")
    .eq("key", "bearer_sha256")
    .single();
  return !error && typeof data?.value === "string" && data.value === tokenHash;
}

Deno.serve(async (req: Request) => {
  try {
    if (!(await authorized(req))) return json(401, { ok: false, error: "unauthorized" });

    const pathname = new URL(req.url).pathname;
    if (req.method === "GET" && pathname.endsWith("/health")) {
      return json(200, {
        ok: true,
        protocol: "world-server-cas-http-v1",
        backing: "supabase-postgres",
        region: Deno.env.get("SB_REGION") ?? null,
        maxBytes: MAX_BYTES,
      });
    }

    const match = pathname.match(/\/cas\/sha256\/([a-f0-9]{64})$/);
    if (!match) return json(404, { ok: false, error: "not-found" });
    const expected = match[1];

    if (req.method === "PUT") {
      const bytes = new Uint8Array(await req.arrayBuffer());      if (bytes.byteLength > MAX_BYTES) return json(413, { ok: false, error: "object-too-large" });
      const actual = await sha256Hex(bytes);
      if (actual !== expected) return json(400, { ok: false, error: "digest-mismatch" });
      const { error } = await supabase.from("world_server_cas_objects").upsert({
        digest: expected,
        payload_base64: toBase64(bytes),
        size_bytes: bytes.byteLength,
      }, { onConflict: "digest" });
      if (error) return json(500, { ok: false, error: "store-failed" });
      return json(201, { ok: true, digest: expected, sizeBytes: bytes.byteLength });
    }

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("world_server_cas_objects")
        .select("payload_base64,size_bytes")
        .eq("digest", expected)
        .maybeSingle();
      if (error) return json(500, { ok: false, error: "read-failed" });
      if (!data) return json(404, { ok: false, error: "missing" });
      const bytes = fromBase64(data.payload_base64);
      if ((await sha256Hex(bytes)) !== expected) return json(500, { ok: false, error: "stored-digest-mismatch" });
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(bytes.byteLength),
          "cache-control": "public, immutable, max-age=31536000",
          "x-world-server-cas-digest": expected,
        },      });
    }

    return json(405, { ok: false, error: "method-not-allowed" });
  } catch (error) {
    console.error("world-server-cas-canary", error instanceof Error ? error.message : String(error));
    return json(500, { ok: false, error: "internal" });
  }
});
