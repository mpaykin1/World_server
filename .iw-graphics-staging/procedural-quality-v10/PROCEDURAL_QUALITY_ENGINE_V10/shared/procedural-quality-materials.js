(() => {
  'use strict';
  const G=globalThis;if(G.WorldProceduralMaterials)return;
  const fract=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function hash2(x,y){return fract(Math.sin(x*127.1+y*311.7)*43758.5453123)}
  function valueNoise(x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=fract(x),fy=fract(y),u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return mix(mix(hash2(ix,iy),hash2(ix+1,iy),u),mix(hash2(ix,iy+1),hash2(ix+1,iy+1),u),v)}
  function fbm(x,y,octaves=5){let a=.5,f=1,s=0,n=0;for(let i=0;i<octaves;i++){s+=valueNoise(x*f,y*f)*a;n+=a;f*=2.03;a*=.5}return s/n}
  function sample(kind,u,v,t=0){const n=fbm(u*9+t*.003,v*9,5),n2=fbm(u*31,v*31,3);let albedo=[.3,.3,.3],roughness=.7,metalness=0,height=(n-.5)*.04;
    if(kind==='wood'){const warp=(n-.5)*.13,ring=.5+.5*Math.sin((u+warp)*78+Math.sin(v*8)*2.2);const g=ring*.72+n2*.28;albedo=[.16+g*.22,.075+g*.12,.022+g*.045];roughness=.48+n2*.22;height=(g-.5)*.08}
    else if(kind==='concrete'){albedo=[.13+n*.08,.13+n*.075,.125+n*.065];roughness=.76+n2*.18;height=(n2-.5)*.07}
    else if(kind==='skin'){const pore=(n2-.5)*.018;albedo=[.42+pore,.285+pore*.8,.19+pore*.6];roughness=.47+n*.12;height=pore*.28}
    else if(kind==='cloth'){const weave=(Math.sin(u*310)*Math.sin(v*330))*.5+.5;albedo=[.035+weave*.018,.04+weave*.018,.05+weave*.022];roughness=.84;height=(weave-.5)*.018}
    else if(kind==='metal'){albedo=[.11+n*.05,.115+n*.05,.12+n*.05];roughness=.2+n2*.28;metalness=.92;height=(n2-.5)*.015}
    return {albedo,roughness:clamp(roughness,0,1),metalness,height};
  }
  const wgslLibrary=String.raw`
fn pq_hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p,vec2<f32>(127.1,311.7)))*43758.5453); }
fn pq_noise(p: vec2<f32>) -> f32 {
  let i=floor(p); let f=fract(p); let u=f*f*(vec2<f32>(3.0)-2.0*f);
  return mix(mix(pq_hash(i),pq_hash(i+vec2<f32>(1,0)),u.x),mix(pq_hash(i+vec2<f32>(0,1)),pq_hash(i+vec2<f32>(1,1)),u.x),u.y);
}
fn pq_fbm(p0: vec2<f32>) -> f32 { var p=p0; var a=.5; var s=0.0; var n=0.0; for(var i=0;i<5;i++){s+=pq_noise(p)*a;n+=a;p*=2.03;a*=.5;} return s/n; }
fn pq_aces(x: vec3<f32>) -> vec3<f32> { let a=2.51;let b=.03;let c=2.43;let d=.59;let e=.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),vec3<f32>(0),vec3<f32>(1)); }
`;
  function deriveFields(kind,u,v,t=0){const c=sample(kind,u,v,t),e=.002,hx=sample(kind,u+e,v,t).height-sample(kind,u-e,v,t).height,hy=sample(kind,u,v+e,t).height-sample(kind,u,v-e,t).height,l=Math.hypot(hx,hy,1);return{...c,normal:[-hx/l,-hy/l,1/l]}}
  G.WorldProceduralMaterials={version:'3.0.0',sample,deriveFields,valueNoise,fbm,wgslLibrary,computeFields:true};
})();
