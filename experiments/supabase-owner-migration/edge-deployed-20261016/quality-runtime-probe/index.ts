import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TARGET = "https://world-server.vercel.app";
const WARN_CHECK_MS = 2000;
const WARN_TOTAL_MS = 3500;
const MAX_REDIRECTS = 5;
const MAX_SCRIPT_BYTES = 1_500_000;
const RPC_MAX_ATTEMPTS = 3;
const RPC_RETRY_BASE_MS = 650;

type Expect = "html" | "json";
type Feature = "interactive-site" | "canvas" | "controls" | "audio" | "progress";
type Candidate = { url:string; expect:Expect; label?:string; requiredFeatures?:Feature[] };

function isJwtClockSkew(status:number, text:string) {
  return status === 401 && /PGRST303/i.test(text) && /JWT issued at future/i.test(text);
}
function sleep(ms:number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function rpc(name:string,args:Record<string,unknown>={}) {
  let lastError = "";
  for (let attempt=1;attempt<=RPC_MAX_ATTEMPTS;attempt++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method:"POST",
      headers:{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,"content-type":"application/json"},
      body:JSON.stringify(args),
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    lastError = `${name} ${r.status}: ${text.slice(0,400)}`;
    if (!isJwtClockSkew(r.status,text) || attempt===RPC_MAX_ATTEMPTS) throw new Error(lastError);
    await sleep(RPC_RETRY_BASE_MS * attempt);
  }
  throw new Error(lastError || `${name} RPC failed`);
}

function isPrivateIpv4(host:string) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a,b] = [Number(m[1]),Number(m[2])];
  return a===10 || a===127 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || a===0;
}
function urlPolicy(url:string, expect:Expect) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return {ok:false,reason:"only public HTTPS targets are allowed"};
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "::1" || h.endsWith(".local") || isPrivateIpv4(h)) return {ok:false,reason:"private/local targets are forbidden"};
    const supabaseEdgeHtml = expect === "html" && h.endsWith(".supabase.co") && u.pathname.includes("/functions/v1/");
    return {ok:!supabaseEdgeHtml,reason:supabaseEdgeHtml?"HTML pages must not be hosted on Supabase Edge Function shared domains":null};
  } catch { return {ok:false,reason:"invalid URL"}; }
}
async function fetchSafe(url:string, expect:Expect) {
  let current = url;
  const redirectChain:any[] = [];
  for (let i=0;i<=MAX_REDIRECTS;i++) {
    const policy = urlPolicy(current,expect);
    if (!policy.ok) throw new Error(String(policy.reason));
    const r = await fetch(current,{method:"GET",redirect:"manual",headers:{"user-agent":"world-server-quality-probe/v10.6"},signal:AbortSignal.timeout(10000)});
    if ([301,302,303,307,308].includes(r.status)) {
      const location = r.headers.get("location");
      if (!location) throw new Error(`redirect ${r.status} without Location`);
      if (i===MAX_REDIRECTS) throw new Error("redirect limit exceeded");
      const next = new URL(location,current).toString();
      const nextPolicy = urlPolicy(next,expect);
      if (!nextPolicy.ok) throw new Error(`unsafe redirect: ${nextPolicy.reason}`);
      redirectChain.push({status:r.status,from:current,to:next});
      try { await r.body?.cancel(); } catch {}
      current = next;
      continue;
    }
    return {response:r,finalUrl:current,redirectChain};
  }
  throw new Error("redirect limit exceeded");
}
function htmlFeatureEvidence(body:string, required:Feature[] = []) {
  const hasScript = /<script\b/i.test(body);
  const hasInteraction = /<button\b|<input\b|<a\b/i.test(body);
  const checks:Record<string,boolean> = {};
  for (const feature of required) {
    if (feature === "interactive-site") checks[feature] = hasScript && hasInteraction;
    if (feature === "canvas") checks[feature] = /<canvas\b|WebGLRenderer|three\.module|from ['\"]three['\"]|canvas\s*\{/i.test(body);
    if (feature === "controls") checks[feature] = /WASD|movePad|lookZone|jumpBtn|pointerlock|data-style=/i.test(body);
    if (feature === "audio") checks[feature] = /AudioContext|speechSynthesis|<audio\b/i.test(body);
    if (feature === "progress") checks[feature] = /progress|percent|barFill|%/i.test(body);
  }
  const imageOnly = /<img\b/i.test(body) && !hasScript && !hasInteraction && !/<canvas\b/i.test(body);
  return {checks,imageOnly,pass:!imageOnly && Object.values(checks).every(Boolean)};
}
async function runtimeCanvasEvidence(body:string,baseUrl:string) {
  const srcs = [...body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).slice(0,6);
  const evidence:any[] = [];
  for (const src of srcs) {
    let scriptUrl:string;
    try { scriptUrl = new URL(src,baseUrl).toString(); } catch { continue; }
    const policy = urlPolicy(scriptUrl,"json");
    if (!policy.ok) continue;
    try {
      const r = await fetch(scriptUrl,{redirect:"follow",headers:{"user-agent":"world-server-quality-probe/v10.6-script"},signal:AbortSignal.timeout(8000)});
      if (!r.ok) { evidence.push({url:scriptUrl,status:r.status,renderer:false}); continue; }
      const len = Number(r.headers.get("content-length")||0);
      if (len>MAX_SCRIPT_BYTES) { evidence.push({url:scriptUrl,status:r.status,renderer:false,skipped:"too-large"}); continue; }
      const text = (await r.text()).slice(0,MAX_SCRIPT_BYTES);
      const renderer = /WebGLRenderer|createElement\s*\(\s*['\"]canvas['\"]\s*\)|renderer\.domElement|getContext\s*\(\s*['\"]webgl/i.test(text);
      evidence.push({url:scriptUrl,status:r.status,renderer});
      if (renderer) return {ok:true,evidence};
    } catch (e) { evidence.push({url:scriptUrl,status:0,renderer:false,error:String(e).slice(0,120)}); }
  }
  return {ok:false,evidence};
}
async function checkUrl(url:string,expect:Expect,label:string,requiredFeatures:Feature[] = []) {
  const started = performance.now();
  const policy = urlPolicy(url,expect);
  if (!policy.ok) return {path:label,url,expect,ok:false,policyError:policy.reason,status:0,durationMs:0,bytes:0};
  try {
    const {response,finalUrl,redirectChain} = await fetchSafe(url,expect);
    const body = await response.text();
    const contentType = (response.headers.get("content-type")||"").toLowerCase();
    const typeOk = expect === "html" ? (contentType.includes("text/html")||contentType.includes("application/xhtml+xml")) : contentType.includes("application/json");
    const mojibake = /Р[\u0080-\u00FF]|РЎ|Рё|Р°|Рµ/.test(body.slice(0,12000));
    let artifact:any = expect === "html" ? htmlFeatureEvidence(body,requiredFeatures) : {checks:{},imageOnly:false,pass:true};
    if (expect === "html" && requiredFeatures.includes("canvas") && artifact.checks.canvas !== true) {
      const runtime = await runtimeCanvasEvidence(body,finalUrl);
      artifact = {...artifact,runtimeCanvas:runtime};
      if (runtime.ok) artifact.checks.canvas = true;
      artifact.pass = !artifact.imageOnly && Object.values(artifact.checks).every(Boolean);
    }
    const durationMs = Math.round(performance.now()-started);
    const ok = response.status>=200 && response.status<400 && body.length>0 && typeOk && !mojibake && artifact.pass;
    return {path:label,url,finalUrl,redirectChain,expect,requiredFeatures,ok,typeOk,mojibake,artifact,slow:durationMs>WARN_CHECK_MS,status:response.status,durationMs,bytes:body.length,contentType,vercelId:response.headers.get("x-vercel-id"),cache:response.headers.get("x-vercel-cache")};
  } catch (error) {
    return {path:label,url,expect,requiredFeatures,ok:false,slow:false,status:0,durationMs:Math.round(performance.now()-started),bytes:0,error:String(error instanceof Error?error.message:error).slice(0,300)};
  }
}

Deno.serve(async (request:Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed",{status:405});
  if (!SUPABASE_URL || !SERVICE_ROLE) return Response.json({ok:false,error:"Supabase runtime env missing"},{status:500});
  try {
    const token = request.headers.get("x-quality-cron-token") ?? "";
    const authorized = await rpc("quality_verify_probe_token",{p_token:token});
    if (authorized !== true) return Response.json({ok:false,error:"Unauthorized"},{status:401});
    let requested:Candidate[] = [];
    try { const body = await request.json(); if (Array.isArray(body?.candidateUrls)) requested = body.candidateUrls.slice(0,12); } catch {}
    const started = performance.now();
    const defaults:Candidate[] = [
      {url:new URL("/",TARGET).toString(),expect:"html",label:"/"},
      {url:new URL("/api/apps",TARGET).toString(),expect:"json",label:"/api/apps"},
      {url:new URL("/apps/voxel-world/",TARGET).toString(),expect:"html",label:"/apps/voxel-world/",requiredFeatures:["interactive-site","canvas","controls"]}
    ];
    const candidates = requested.map((x,i)=>({url:String(x.url||""),expect:x.expect==="json"?"json" as Expect:"html" as Expect,label:x.label||`candidate-${i+1}`,requiredFeatures:Array.isArray(x.requiredFeatures)?x.requiredFeatures:[]}));
    const checks = await Promise.all([...defaults,...candidates].map(x=>checkUrl(x.url,x.expect,x.label||"candidate",x.requiredFeatures||[])));
    const durationMs = Math.round(performance.now()-started);
    const reachable = checks.every((item:any)=>item.ok);
    const slow = reachable && (durationMs>WARN_TOTAL_MS || checks.some((item:any)=>item.slow));
    const status = !reachable?"failed":slow?"degraded":"healthy";
    const now = new Date();
    const probe = {probeKey:`probe-${now.toISOString()}`,status,durationMs,target:TARGET,thresholds:{perCheckMs:WARN_CHECK_MS,totalMs:WARN_TOTAL_MS},checks,source:"supabase-edge-v10.6-clockskew-resilient",createdAt:now.toISOString(),transientRetryPolicy:{maxAttempts:RPC_MAX_ATTEMPTS,exactClass:"PGRST303 JWT issued at future"}};
    const recorded = await rpc("quality_record_synthetic_probe",{p_result:probe});
    const httpStatus = status==="failed"?503:status==="degraded"?202:200;
    return Response.json({ok:status==="healthy",status,recorded,probe},{status:httpStatus});
  } catch (e) {
    return Response.json({ok:false,error:String(e instanceof Error?e.message:e).slice(0,500)},{status:500});
  }
});