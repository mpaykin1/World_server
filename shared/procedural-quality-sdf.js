(() => {
  'use strict'; const G=globalThis;if(G.WorldProceduralSDF)return;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function circle(x,y,r,mat=0){return {type:'circle',x,y,r,mat}}
  function box(x,y,hx,hy,mat=0){return {type:'box',x,y,hx,hy,mat}}
  function capsule(ax,ay,bx,by,r,mat=0){return {type:'capsule',ax,ay,bx,by,r,mat}}
  function scene(nodes=[]){return {nodes:[...nodes],add(n){this.nodes.push(n);return n}}}
  function escapeNum(n){n=Number(n)||0;return Number(n.toFixed(6)).toString()}
  function compileWGSL(sc){const ns=(sc&&sc.nodes)||[];let body='var d=1e9; var mat=0.0;\n';
    ns.slice(0,96).forEach((n,i)=>{let e='1e9';if(n.type==='circle')e=`length(p-vec2<f32>(${escapeNum(n.x)},${escapeNum(n.y)}))-${escapeNum(n.r)}`;
      else if(n.type==='box')e=`pq_sdBox(p-vec2<f32>(${escapeNum(n.x)},${escapeNum(n.y)}),vec2<f32>(${escapeNum(n.hx)},${escapeNum(n.hy)}))`;
      else if(n.type==='capsule')e=`pq_sdCapsule(p,vec2<f32>(${escapeNum(n.ax)},${escapeNum(n.ay)}),vec2<f32>(${escapeNum(n.bx)},${escapeNum(n.by)}),${escapeNum(n.r)})`;
      body+=`let d${i}=${e}; if(d${i}<d){d=d${i};mat=${escapeNum(n.mat||0)};}\n`;});
    return String.raw`fn pq_sdBox(p:vec2<f32>,b:vec2<f32>)->f32{let q=abs(p)-b;return length(max(q,vec2<f32>(0)))+min(max(q.x,q.y),0.0);}fn pq_sdCapsule(p:vec2<f32>,a:vec2<f32>,b:vec2<f32>,r:f32)->f32{let pa=p-a;let ba=b-a;let h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h)-r;}fn pq_scene(p:vec2<f32>)->vec2<f32>{${body}return vec2<f32>(d,mat);}`;
  }
  G.WorldProceduralSDF={version:'2.0.0',circle,box,capsule,scene,compileWGSL,clamp};
})();
