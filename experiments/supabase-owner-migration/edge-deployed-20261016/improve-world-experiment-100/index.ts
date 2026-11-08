import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const URL=Deno.env.get("SUPABASE_URL")??"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const SLUG="improve-world-experiment-100";

async function getState(){
  const {data,error}=await db.from("page_release_state").select("stable_url,candidate_url,candidate_status").eq("slug",SLUG).single();
  if(error||!data) throw new Error(error?.message||"release state missing");
  return data;
}

function inspect(body:string,contentType:string,status:number){
  const t=body.trim();
  const html=contentType.includes("text/html")||contentType.includes("application/xhtml+xml");
  const placeholder=/^(test|hello|hello world|ok)$/i.test(t)||t.length<1200;
  const hasProduct=/IMPROVE WORLD/i.test(body);
  const hasInteraction=/<button\b|<canvas\b|<main\b/i.test(body);
  return {ok:status>=200&&status<400&&html&&!placeholder&&hasProduct&&hasInteraction,status,html,placeholder,hasProduct,hasInteraction,bytes:body.length};
}

async function verifyCandidate(candidate:string){
  try{
    const r=await fetch(candidate,{redirect:"follow",signal:AbortSignal.timeout(12000),headers:{"user-agent":"world-server-release-guard/1.0"}});
    const body=await r.text();
    const result=inspect(body,(r.headers.get("content-type")||"").toLowerCase(),r.status);
    return {...result,finalUrl:r.url,contentType:r.headers.get("content-type")};
  }catch(e){return {ok:false,error:String(e instanceof Error?e.message:e),status:0,bytes:0};}
}

Deno.serve(async(req:Request)=>{
  if(!URL||!KEY) return Response.json({ok:false,error:"release guard env missing"},{status:500});
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,HEAD,POST,OPTIONS","access-control-allow-headers":"content-type,x-quality-cron-token"}});
  if(req.method==="GET"||req.method==="HEAD"){
    try{
      const s=await getState();
      const src=new URL(req.url),dst=new URL(s.stable_url);dst.search=src.search;
      return new Response(null,{status:302,headers:{location:dst.toString(),"cache-control":"no-store","x-world-server-release":"stable-only","x-world-server-candidate-status":s.candidate_status||"none","x-world-server-guard":"candidate-must-pass-before-promotion"}});
    }catch(e){return Response.json({ok:false,error:String(e instanceof Error?e.message:e)},{status:500});}
  }
  if(req.method!=="POST") return new Response("Method Not Allowed",{status:405});

  const token=req.headers.get("x-quality-cron-token")??"";
  const {data:authorized}=await db.rpc("quality_verify_probe_token",{p_token:token});
  if(authorized!==true) return Response.json({ok:false,error:"Unauthorized"},{status:401});

  let payload:any={};try{payload=await req.json();}catch{}
  if(payload?.action!=="promote"||!payload?.candidateUrl) return Response.json({ok:true,note:"stable unchanged"});
  const candidate=String(payload.candidateUrl);
  await db.from("page_release_state").update({candidate_url:candidate,candidate_status:"testing",updated_at:new Date().toISOString()}).eq("slug",SLUG);
  const check=await verifyCandidate(candidate);
  if(!check.ok){
    await db.from("page_release_state").update({candidate_status:"failed",last_check:check,updated_at:new Date().toISOString()}).eq("slug",SLUG);
    return Response.json({ok:false,promoted:false,stableUnchanged:true,check},{status:422});
  }
  await db.from("page_release_state").update({stable_url:candidate,candidate_url:candidate,candidate_status:"promoted",last_check:check,updated_at:new Date().toISOString()}).eq("slug",SLUG);
  return Response.json({ok:true,promoted:true,stableUrl:candidate,check});
});