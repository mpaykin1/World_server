(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralDeformationVelocity?.version==='9.0.0')return;
const providers=new WeakMap(),history=new WeakMap();
function register(object,provider){
 if(!object||!provider)throw new TypeError('object/provider required');
 if(typeof provider.velocity!=='function'&&typeof provider.positions!=='function'&&!provider.texturePair)throw new TypeError('provider needs velocity(), positions(), or texturePair');
 providers.set(object,provider);object.userData=object.userData||{};object.userData.__pqExactDeformationVelocity=true;
 return()=>{providers.delete(object);if(object.userData)delete object.userData.__pqExactDeformationVelocity};
}
function beginFrame(object,ctx={}){
 const p=providers.get(object);if(!p)return{exact:false,reactive:true,reason:'no-provider'};
 let h=history.get(object);if(!h){h={previous:null,current:null,frame:-1};history.set(object,h)}
 if(typeof p.positions==='function'){const cur=p.positions(object,ctx);h.previous=h.current;h.current=cur;h.frame++;return{exact:!!h.previous,reactive:!h.previous,previous:h.previous,current:h.current,frame:h.frame}}
 if(p.texturePair)return{exact:true,reactive:false,...p.texturePair(object,ctx)};
 return{exact:true,reactive:false,velocity:(vertex,index)=>p.velocity(object,vertex,index,ctx)};
}
function sample(object,vertex,index,ctx={}){
 const p=providers.get(object);if(!p)return null;if(typeof p.velocity==='function')return p.velocity(object,vertex,index,ctx);
 const h=history.get(object);if(!h?.previous||!h.current)return null;const i=index*3,a=h.previous,b=h.current;return[(b[i]-a[i])||0,(b[i+1]-a[i+1])||0,(b[i+2]-a[i+2])||0];
}
function reactiveRequired(object){return!providers.has(object)}
function status(object){const p=providers.get(object),h=history.get(object);return{registered:!!p,exact:!!p,historyFrames:h?.frame??-1}}
G.WorldProceduralDeformationVelocity={version:'9.0.0',register,beginFrame,sample,reactiveRequired,status};
})();