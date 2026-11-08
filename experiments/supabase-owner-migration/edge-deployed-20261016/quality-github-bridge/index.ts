const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "world-server-quality-bridge";
const REPOSITORY = "mpaykin1/World_server";
const ALLOWED_WORKFLOWS = [
  `${REPOSITORY}/.github/workflows/quality-runtime-bridge.yml@`,
  `${REPOSITORY}/.github/workflows/supabase-schema-autosync.yml@`,
  `${REPOSITORY}/.github/workflows/supabase-schema-drift.yml@`,
];

let jwksCache: { at: number; keys: JsonWebKey[] } | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function b64urlBytes(s: string) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const raw = atob(p);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function decodeJsonPart(s: string) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function getJwks(): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const r = await fetch(`${ISSUER}/.well-known/jwks`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`github jwks ${r.status}`);
  const data = await r.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (!keys.length) throw new Error("github jwks empty");
  jwksCache = { at: Date.now(), keys };
  return keys;
}

async function verifyOidc(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid jwt shape");
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("unsupported jwt header");
  const keys = await getJwks();
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("jwt kid not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error("jwt signature invalid");
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error("jwt issuer invalid");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(AUDIENCE)) throw new Error("jwt audience invalid");
  if (!Number.isFinite(claims.exp) || claims.exp < now - 15) throw new Error("jwt expired");
  if (Number.isFinite(claims.nbf) && claims.nbf > now + 15) throw new Error("jwt not active");
  if (claims.repository !== REPOSITORY) throw new Error("repository not allowed");
  const workflowRef = String(claims.workflow_ref || "");
  if (!ALLOWED_WORKFLOWS.some((prefix) => workflowRef.startsWith(prefix))) throw new Error("workflow not allowed");
  return claims;
}

async function rpc(name: string, body: Record<string, unknown> = {}) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("supabase service environment unavailable");
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function audit(claims: any, action: string, ok: boolean, detail: Record<string, unknown> = {}) {
  try {
    await rpc("quality_record_github_bridge_event", {
      p_event: {
        action,
        repository: claims.repository,
        sha: claims.sha,
        workflowRef: claims.workflow_ref,
        actor: claims.actor,
        ref: claims.ref,
        subject: claims.sub,
        ok,
        detail,
      },
    });
  } catch (_) {}
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "GitHub OIDC bearer token required" }, 401);
  let claims: any;
  try {
    claims = await verifyOidc(auth.slice(7));
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const action = String(body?.action || "status");

  try {
    let data: any;
    if (action === "migration-export") {
      data = await rpc("quality_export_migration_history");
    } else if (action === "work-packet") {
      data = await rpc("quality_desktop_ai_work_packet");
    } else if (action === "record-manifest") {
      if (claims.ref !== "refs/heads/master") throw new Error("record-manifest requires refs/heads/master");
      const names = Array.isArray(body?.migrationNames) ? body.migrationNames.map(String) : [];
      if (!names.length) throw new Error("migrationNames required");
      data = await rpc("quality_record_schema_manifest", { p_repo_sha: String(claims.sha || ""), p_migration_names: names });
    } else if (action === "record-master-protection") {
      const protectedStatus = body?.protected === true;
      data = await rpc("quality_record_external_control", {
        p_key: "github.master.protected",
        p_status: protectedStatus,
        p_source: "github-actions-oidc-v12",
        p_details: {
          repository: claims.repository,
          sha: claims.sha,
          ref: claims.ref,
          workflowRef: claims.workflow_ref,
          protected: protectedStatus,
          github: body?.github || {},
        },
      });
      await rpc("quality_external_control_gap_cycle");
    } else if (action === "status") {
      data = {
        runtime: await rpc("quality_runtime_status"),
        security: await rpc("quality_security_definer_status"),
        controls: await rpc("quality_external_controls_status"),
        bridge: await rpc("quality_github_bridge_status"),
      };
    } else {
      throw new Error("action not allowed");
    }
    await audit(claims, action, true, { responseType: typeof data });
    return json({ ok: true, action, repository: claims.repository, sha: claims.sha, data });
  } catch (e) {
    await audit(claims, action, false, { error: String(e?.message || e).slice(0, 500) });
    return json({ ok: false, action, error: String(e?.message || e) }, 400);
  }
});
