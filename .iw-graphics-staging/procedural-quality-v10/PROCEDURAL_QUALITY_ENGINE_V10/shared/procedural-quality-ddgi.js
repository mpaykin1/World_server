(() => {
'use strict';const G=globalThis;if(G.WorldProceduralDDGI)return;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
function create({min=[-1,-1,-1],max=[1,1,1],resolution=[6,4,6],hysteresis=.92,maxBounces=2}={}){
  const [nx,ny,nz]=resolution.map(v=>Math.max(2,v|0)),count=nx*ny*nz;
  const probes=Array.from({length:count},(_,i)=>({rgb:[0,0,0],visibility:1,valid:false,age:0,offset:[0,0,0],i}));
  const idx=(x,y,z)=>x+nx*(y+ny*z);
  function position(x,y,z){return[
    mix(min[0],max[0],x/(nx-1)),mix(min[1],max[1],y/(ny-1)),mix(min[2],max[2],z/(nz-1))
  ]}
  function updateProbe(i,sample,{history=hysteresis}={}){
    const p=probes[i];if(!p||!sample)return;
    const rgb=sample.rgb||[0,0,0],h=p.valid?clamp(history,0,.99):0;
    p.rgb=p.rgb.map((v,k)=>mix(Number(rgb[k]||0),v,h));
    p.visibility=mix(Number(sample.visibility??1),p.visibility,h);
    p.valid=true;p.age++;
  }
  function relocate(distanceFn,maxStep=.18){
    if(typeof distanceFn!=='function')return 0;let moved=0;
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const i=idx(x,y,z),base=position(x,y,z),p=probes[i],pos=base.map((v,k)=>v+p.offset[k]);
      const d=Number(distanceFn(pos));if(Number.isFinite(d)&&d<.02){
        const eps=.01,grad=[0,1,2].map(k=>{const a=[...pos],b=[...pos];a[k]+=eps;b[k]-=eps;return(Number(distanceFn(a))-Number(distanceFn(b)))/(2*eps)});
        const l=Math.hypot(...grad)||1;p.offset=p.offset.map((v,k)=>clamp(v+grad[k]/l*maxStep,-.35,.35));moved++;
      }
    }return moved;
  }
  function bounce(iterations=maxBounces){
    for(let it=0;it<iterations;it++){
      const prev=probes.map(p=>p.rgb.slice());
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=idx(x,y,z),acc=[0,0,0];let n=0;
        for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
          const X=x+dx,Y=y+dy,Z=z+dz;if(X<0||Y<0||Z<0||X>=nx||Y>=ny||Z>=nz)continue;
          const q=prev[idx(X,Y,Z)];for(let k=0;k<3;k++)acc[k]+=q[k];n++;
        }
        if(n&&probes[i].valid)probes[i].rgb=probes[i].rgb.map((v,k)=>v+acc[k]/n*.12*probes[i].visibility);
      }
    }
  }
  function sample(pos){
    const uvw=[0,1,2].map(k=>clamp((pos[k]-min[k])/(max[k]-min[k]),0,1));
    const fx=uvw[0]*(nx-1),fy=uvw[1]*(ny-1),fz=uvw[2]*(nz-1),x0=Math.floor(fx),y0=Math.floor(fy),z0=Math.floor(fz),tx=fx-x0,ty=fy-y0,tz=fz-z0;
    const out=[0,0,0];let wsum=0;
    for(let dz=0;dz<=1;dz++)for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
      const x=Math.min(nx-1,x0+dx),y=Math.min(ny-1,y0+dy),z=Math.min(nz-1,z0+dz),p=probes[idx(x,y,z)];
      const w=(dx?tx:1-tx)*(dy?ty:1-ty)*(dz?tz:1-tz)*p.visibility;
      if(p.valid){for(let k=0;k<3;k++)out[k]+=p.rgb[k]*w;wsum+=w}
    }return wsum?out.map(v=>v/wsum):out;
  }
  return{version:'6.0.0',min,max,resolution:[nx,ny,nz],probes,updateProbe,relocate,bounce,sample,position,index:idx};
}
const wgsl=`
struct Probe { radiance: vec4f, meta: vec4f };
@group(0) @binding(0) var<storage,read_write> probes: array<Probe>;
@compute @workgroup_size(64)
fn pq_ddgi_temporal(@builtin(global_invocation_id) gid: vec3u) {
  let i=gid.x; if(i>=arrayLength(&probes)){return;}
  probes[i].radiance.rgb=max(probes[i].radiance.rgb,vec3f(0.0));
}`;
G.WorldProceduralDDGI={version:'6.0.0',create,wgsl};
})();
