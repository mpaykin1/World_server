import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const EXPECTED_TOKEN_HASH="4ef359200ebac8ed05091c7186d814431c8cae4af045c264560f2407ce5b0c45";const enc=new TextEncoder();
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",enc.encode(v));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("")}
function out(s:number,b:Record<string,unknown>){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
Deno.serve(async(req:Request)=>{
 if(req.method==="GET")return out(200,{ok:true,service:"worlds-vehicles-feedback",version:3});
 if(req.method!=="POST")return out(405,{ok:false,error:"method_not_allowed"});
 const token=req.headers.get("x-api-key")??"";if(!token||await sha(token)!==EXPECTED_TOKEN_HASH)return out(401,{ok:false,error:"unauthorized"});
 if(Number(req.headers.get("content-length")??"0")>64000)return out(413,{ok:false,error:"payload_too_large"});
 let e:any;try{e=await req.json()}catch{return out(400,{ok:false,error:"invalid_json"})}
 if(!e||e.source!=="roblox_worlds_vehicles"||typeof e.kind!=="string")return out(400,{ok:false,error:"invalid_event"});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return out(500,{ok:false,error:"server_not_configured"});
 const db=createClient(url,key,{auth:{persistSession:false}}),p=e.payload??{};let result:any;
 if(e.kind==="ping"){const ping=await db.from("vehicle_build_health").insert({version:String(e.version??""),place_id:Number(e.placeId??0),job_id:String(e.jobId??""),total_readiness:100,categories:{bridge:"authenticated",kind:"ping"},failures:[],raw_payload:e});if(ping.error){console.error("ping_log_failed",ping.error.code,ping.error.message);return out(500,{ok:false,error:"ping_log_failed"})}return out(200,{ok:true,accepted:"ping",version:3});}
 if(e.kind==="proposal")result=await db.from("vehicle_feature_proposals").upsert({id:String(p.Id??crypto.randomUUID()),author_user_id:Number(p.AuthorUserId??0),author_name:String(p.AuthorName??""),name:String(p.Name??"").slice(0,120),body:String(p.Body??"").slice(0,1000),why:String(p.Why??"").slice(0,600),category:String(p.Category??"OTHER").slice(0,40),status:String(p.Status??"NEW").slice(0,30),votes:Math.max(1,Number(p.Votes??1)),source_version:String(e.version??""),raw_payload:e},{onConflict:"id"});
 else if(e.kind==="feedback")result=await db.from("vehicle_feedback").insert({source:String(e.source),version:String(e.version??""),place_id:Number(e.placeId??0),job_id:String(e.jobId??""),user_id:Number(p.UserId??0),display_name:String(p.DisplayName??""),feedback_text:String(p.Text??"").slice(0,2000),runtime_context:{runtimeReady:p.RuntimeReady===true,vehicleReady:p.VehicleReady===true,repairReady:p.RepairReady===true},raw_payload:e});
 else if(e.kind==="build_health")result=await db.from("vehicle_build_health").insert({version:String(e.version??""),place_id:Number(e.placeId??0),job_id:String(e.jobId??""),total_readiness:Math.max(0,Math.min(100,Number(p.TotalReadiness??0))),categories:p.Categories??{},failures:p.Failures??[],raw_payload:e});
 else return out(400,{ok:false,error:"unsupported_kind"});
 if(result.error){console.error("database_write_failed",result.error.code,result.error.message);return out(500,{ok:false,error:"database_write_failed"})}
 return out(202,{ok:true,accepted:e.kind});
});