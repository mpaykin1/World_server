import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TARGET = "https://world-server.vercel.app";
const CAPABILITIES = ["runtime", "supabase", "http", "probe"];
const ALLOWED_KINDS = ["runtime.synthetic.failed", "runtime.synthetic.slow"];
const RPC_MAX_ATTEMPTS = 3;
const RPC_RETRY_BASE_MS = 650;

function isJwtClockSkew(status:number, text:string) {
  return status === 401 && /PGRST303/i.test(text) && /JWT issued at future/i.test(text);
}
function sleep(ms:number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function rpc(name: string, args: Record<string, unknown> = {}) {
  let lastError = "";
  for (let attempt = 1; attempt <= RPC_MAX_ATTEMPTS; attempt++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    lastError = `${name} ${r.status}: ${text.slice(0, 400)}`;
    if (!isJwtClockSkew(r.status, text) || attempt === RPC_MAX_ATTEMPTS) throw new Error(lastError);
    await sleep(RPC_RETRY_BASE_MS * attempt);
  }
  throw new Error(lastError || `${name} RPC failed`);
}

async function checkPath(path: string) {
  const started = Date.now();
  try {
    const r = await fetch(`${TARGET}${path}`, { method: "GET", redirect: "follow", headers: { "user-agent": "world-server-quality-worker/v11.2" }, signal: AbortSignal.timeout(10000) });
    const body = await r.text();
    return { path, ok: r.status >= 200 && r.status < 400 && body.length > 0, status: r.status, bytes: body.length, durationMs: Date.now() - started, vercelId: r.headers.get("x-vercel-id"), cache: r.headers.get("x-vercel-cache") };
  } catch (e) {
    return { path, ok: false, status: 0, bytes: 0, durationMs: Date.now() - started, error: String(e?.message || e).slice(0, 240) };
  }
}

async function syntheticProbe() {
  const started = Date.now();
  const checks = await Promise.all([checkPath("/"), checkPath("/api/apps"), checkPath("/apps/voxel-world/")]);
  const healthy = checks.every((c) => c.ok);
  return { source: "supabase-edge-worker-v11.2-clockskew-resilient", target: TARGET, status: healthy ? "healthy" : "failed", durationMs: Date.now() - started, checks, createdAt: new Date().toISOString() };
}

async function complete(id: number, worker: string, ok: boolean, result: unknown, error?: string) {
  return await rpc("quality_complete_worker_job", { p_id: id, p_worker: worker, p_ok: ok, p_result: result || {}, p_error: error || null });
}

async function escalate(kind: "failure" | "slow", probe: any) {
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "");
  if (kind === "failure") {
    return await rpc("quality_enqueue_worker_job", {
      p_job_key: `runtime-production-failure-${hour}`,
      p_kind: "runtime.production.failure",
      p_priority: 100,
      p_required_capabilities: ["repo", "node", "vercel", "playwright"],
      p_payload: { probe, source: "quality-runtime-worker-v11.2" },
    });
  }
  return await rpc("quality_enqueue_worker_job", {
    p_job_key: `runtime-performance-${hour}`,
    p_kind: "runtime.performance",
    p_priority: 85,
    p_required_capabilities: ["repo", "node", "playwright"],
    p_payload: { probe, thresholdMs: 2500, source: "quality-runtime-worker-v11.2" },
  });
}

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response(JSON.stringify({ error: "runtime env missing" }), { status: 500, headers: { "content-type": "application/json" } });
  try {
    const token = req.headers.get("x-quality-worker-token") || "";
    const valid = await rpc("quality_validate_worker_token", { p_token: token });
    if (valid !== true) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });

    const worker = `supabase-edge-v11.2-${crypto.randomUUID()}`;
    const processed: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < 5; i++) {
      const claimed = await rpc("quality_claim_worker_job_v11", {
        p_worker: worker,
        p_capabilities: CAPABILITIES,
        p_kinds: ALLOWED_KINDS,
        p_lease_seconds: 180,
      });
      const job = Array.isArray(claimed) ? claimed[0] : null;
      if (!job) break;

      try {
        const probe = await syntheticProbe();
        const slow = probe.durationMs > 2500 || probe.checks.some((c: any) => c.durationMs > 2500);
        if (probe.status !== "healthy") {
          await escalate("failure", probe);
          await complete(job.id, worker, false, probe, "production synthetic probe still failing");
        } else if (slow) {
          await escalate("slow", probe);
          await complete(job.id, worker, true, probe);
        } else {
          await complete(job.id, worker, true, probe);
        }
        processed.push({ id: job.id, kind: job.kind, result: probe.status, durationMs: probe.durationMs });
      } catch (e) {
        const message = String(e?.message || e).slice(0, 400);
        try { await complete(job.id, worker, false, {}, message); } catch {}
        errors.push({ id: job.id, kind: job.kind, error: message });
      }
    }

    await rpc("quality_record_worker_heartbeat", { p_worker: "supabase-edge-runtime-v11.2", p_capabilities: CAPABILITIES, p_detail: { processed, errors, allowedKinds: ALLOWED_KINDS, invocation: worker, transientRetryPolicy: { maxAttempts: RPC_MAX_ATTEMPTS, exactClass: "PGRST303 JWT issued at future" } } });
    const score = await rpc("quality_record_runtime_score");
    return new Response(JSON.stringify({ ok: errors.length === 0, processed, errors, score }), { status: errors.length ? 207 : 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e).slice(0, 500) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});