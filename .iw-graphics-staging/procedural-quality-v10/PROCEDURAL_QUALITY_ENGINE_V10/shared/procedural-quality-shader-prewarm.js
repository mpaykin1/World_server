(() => {
'use strict';const G=globalThis;if(G.WorldProceduralShaderPrewarm?.version==='10.0.0')return;
const registries=new WeakMap();
function registry(renderer){let r=registries.get(renderer);if(!r){r={jobs:[],done:0,failed:0,last:null};registries.set(renderer,r)}return r}
function register(renderer,name,fn,priority=.5){if(!renderer||typeof fn!=='function')throw new TypeError('renderer/fn required');const r=registry(renderer);r.jobs.push({name,fn,priority});r.jobs.sort((a,b)=>b.priority-a.priority)}
async function run(renderer,{budgetMs=8}={}){
 const r=registry(renderer),start=performance.now(),out=[];while(r.jobs.length&&performance.now()-start<budgetMs){const j=r.jobs.shift();try{await j.fn(renderer);r.done++;out.push({name:j.name,ok:true})}catch(e){r.failed++;out.push({name:j.name,ok:false,error:String(e?.message||e).slice(0,180)})}}
 r.last={remaining:r.jobs.length,done:r.done,failed:r.failed,spentMs:performance.now()-start};return r.last
}
async function prewarmThree(renderer,scene,camera){if(renderer?.compileAsync)return renderer.compileAsync(scene,camera);if(renderer?.compile)return renderer.compile(scene,camera)}
function status(renderer){return registry(renderer).last||{remaining:registry(renderer).jobs.length,done:registry(renderer).done,failed:registry(renderer).failed}}
G.WorldProceduralShaderPrewarm={version:'10.0.0',register,run,prewarmThree,status};
})();