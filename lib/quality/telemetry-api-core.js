'use strict';
const METRICS = new Set(['fpsP50','fpsP95','errorRate','memoryMb','webglContextLossRate','p95LatencyMs','crashRate','longTasks','drawCalls','vertices','textureUploads','shaderCompiles','shaderCompileMs']);
function bad(message){return Object.assign(new Error(message),{status:400});}
function cleanId(value,name,max=160){const s=String(value||'').trim();if(!s||s.length>max||!/^[a-zA-Z0-9._:/@+-]+$/.test(s))throw bad(`Некорректный ${name}.`);return s;}
function cleanMetrics(input){const out={};for(const[key,raw]of Object.entries(input||{})){if(!METRICS.has(key))continue;const value=Number(raw);if(!Number.isFinite(value))continue;out[key]=Math.max(-1e9,Math.min(1e9,value));}if(!Object.keys(out).length)throw bad('Нет допустимых метрик.');return out;}
function sameOrigin(req){const origin=String(req.headers?.origin||''),host=String(req.headers?.host||'').toLowerCase();if(!origin||!host)return true;try{return new URL(origin).host.toLowerCase()===host;}catch{return false;}}
function percentile(values,p){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;return a[Math.min(a.length-1,Math.max(0,Math.ceil((a.length-1)*p)))]??null;}
function average(values){const a=values.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
function aggregate(rows){const metrics={};for(const key of METRICS){const values=rows.map(r=>Number(r.metrics?.[key])).filter(Number.isFinite);if(!values.length)continue;if(key==='fpsP95')metrics[key]=percentile(values,0.05);else if(key==='p95LatencyMs')metrics[key]=percentile(values,0.95);else metrics[key]=average(values);}return{metrics,samples:rows.length,sessions:new Set(rows.map(r=>r.session_id)).size};}
module.exports={METRICS,aggregate,cleanId,cleanMetrics,sameOrigin};
