// Run: node --test experiments/creature-civilizations/smoke.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('single-file game has no external script or stylesheet dependency',()=>{
 assert.ok(script,'inline game script must exist');
 assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=|\bfetch\s*\(|\bimport\s*\(/i);
});
test('game initializes, renders a frame and exposes working controls',()=>{
 const nodes=new Map();
 const ctx=new Proxy({}, {get:(obj,key)=>key in obj?obj[key]:(key==='createRadialGradient'||key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}),set:(obj,key,val)=>(obj[key]=val,true)});
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',onclick:null,attrs:{},classList:{toggle(){this.closed=!this.closed;return this.closed}},setAttribute(k,v){this.attrs[k]=v},addEventListener(){},setPointerCapture(){},getContext(){return ctx}});return nodes.get(id)};
 const callbacks=[];const storage=new Map();
 const env={document:{getElementById:node},innerWidth:390,innerHeight:844,devicePixelRatio:2,performance:{now:()=>1000},Math,JSON,Number,Array,console,localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},addEventListener(){},requestAnimationFrame:fn=>callbacks.push(fn)};
 vm.runInNewContext(script,env,{timeout:1500});
 assert.equal(callbacks.length,1);
 callbacks.shift()(1016);
 assert.match(node('status').textContent,/существ/);
 assert.equal(typeof node('menu').onclick,'function');node('menu').onclick();assert.equal(node('menu').attrs['aria-expanded'],'true');
 for(const id of ['add','construct','attack','peace','history','pause','save','load','newgame'])assert.equal(typeof node(id).onclick,'function',id);
 node('save').onclick();assert.ok(storage.size>0);const saved=JSON.parse([...storage.values()][0]);assert.equal(saved.resourceOre.length,4);assert.equal(saved.agents.length,28);
 node('load').onclick();assert.match(node('talk').textContent,/восстановлен/);
 node('peace').onclick();assert.match(node('talk').textContent,/перемирие/);
 node('attack').onclick();assert.match(node('talk').textContent,/Сначала/);
 node('newgame').onclick();assert.match(node('talk').textContent,/Новый мир/);
});
