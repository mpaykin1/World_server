import {analyzeGraphicsQuality, qualityFingerprint} from '../../shared/graphics/graphics-quality-governor.mjs';
import {createQualitySceneRecipe, compileQualityScene} from '../../shared/graphics/quality-scene-compiler.mjs';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', {antialias:false, alpha:false, preserveDrawingBuffer:true, powerPreference:'high-performance'});
if (!gl) {
  document.body.innerHTML = '<div style="padding:24px">WebGL2 required.</div>';
  throw new Error('WebGL2 unavailable');
}

const vertexSource = `#version 300 es
precision highp float;
const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(P[gl_VertexID],0.,1.);}`;

const fragmentSource = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uQuality;
uniform vec2 uLook;
uniform float uDebug;

#define FAR 42.0
#define PI 3.14159265359

float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float n=i.x+i.y*57.+i.z*113.;return mix(mix(mix(hash21(vec2(n,n+1.)),hash21(vec2(n+1.,n+2.)),f.x),mix(hash21(vec2(n+57.,n+58.)),hash21(vec2(n+58.,n+59.)),f.x),f.y),mix(mix(hash21(vec2(n+113.,n+114.)),hash21(vec2(n+114.,n+115.)),f.x),mix(hash21(vec2(n+170.,n+171.)),hash21(vec2(n+171.,n+172.)),f.x),f.y),f.z);}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdCylZ(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xy),p.z))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float sdCylY(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float sdTorusZ(vec3 p,vec2 t){vec2 q=vec2(length(p.xy)-t.x,p.z);return length(q)-t.y;}
vec2 U(vec2 a,vec2 b){return a.x<b.x?a:b;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

vec2 mapPrimitive(vec3 p){
  vec2 r=vec2(99.,0.);
  r=U(r,vec2(sdBox(p-vec3(0.,-1.65,-8.),vec3(3.0,.15,15.0)),1.));
  r=U(r,vec2(sdBox(p-vec3(-3.05,.2,-8.),vec3(.22,2.0,15.0)),2.));
  r=U(r,vec2(sdBox(p-vec3(3.05,.2,-8.),vec3(.22,2.0,15.0)),2.));
  r=U(r,vec2(sdBox(p-vec3(0.,2.25,-8.),vec3(3.1,.18,15.0)),2.));
  r=U(r,vec2(sdBox(p-vec3(0.,0.,-20.6),vec3(2.2,1.6,.22)),3.));
  r=U(r,vec2(sdBox(p-vec3(.95,-.9,2.45),vec3(.62,.52,.72)),5.));
  return r;
}

vec2 mapEnhanced(vec3 p){
  vec2 r=vec2(99.,0.);
  float zCell=mod(p.z+1.0,4.0)-2.0;
  float zFine=mod(p.z+.35,1.15)-.575;
  r=U(r,vec2(sdBox(p-vec3(0.,-1.72,-8.),vec3(3.0,.12,15.0)),1.));
  r=U(r,vec2(sdBox(vec3(p.x,p.y+1.56,zFine),vec3(2.55,.055,.045)),3.));
  r=U(r,vec2(sdBox(p-vec3(-2.92,.15,-8.),vec3(.18,2.0,15.0)),2.));
  r=U(r,vec2(sdBox(p-vec3(2.92,.15,-8.),vec3(.18,2.0,15.0)),2.));
  r=U(r,vec2(sdBox(p-vec3(0.,2.22,-8.),vec3(3.05,.14,15.0)),2.));

  vec3 q=p; q.z=zCell;
  r=U(r,vec2(sdBox(q-vec3(-2.52,-.05,0.),vec3(.24,1.85,.24)),3.));
  r=U(r,vec2(sdBox(q-vec3(2.52,-.05,0.),vec3(.24,1.85,.24)),3.));
  r=U(r,vec2(sdBox(q-vec3(-2.18,1.72,0.),vec3(.55,.18,.27)),3.));
  r=U(r,vec2(sdBox(q-vec3(2.18,1.72,0.),vec3(.55,.18,.27)),3.));
  r=U(r,vec2(sdTorusZ(q-vec3(0.,.05,0.),vec2(2.55,.115)),3.));

  vec3 panel=q-vec3(-2.68,-.1,.0); panel.xz*=rot(PI*.5);
  r=U(r,vec2(sdBox(panel,vec3(.72,.68,.08)),6.));
  panel=q-vec3(2.68,-.1,.0); panel.xz*=rot(PI*.5);
  r=U(r,vec2(sdBox(panel,vec3(.72,.68,.08)),6.));

  r=U(r,vec2(sdCylZ(p-vec3(-2.35,.72,-8.),.085,14.8),4.));
  r=U(r,vec2(sdCylZ(p-vec3(-2.12,1.02,-8.),.055,14.8),4.));
  r=U(r,vec2(sdCylZ(p-vec3(2.36,.82,-8.),.075,14.8),4.));
  r=U(r,vec2(sdCylZ(p-vec3(2.14,1.10,-8.),.05,14.8),4.));

  vec3 lamp=q-vec3(0.,1.72,.0);
  r=U(r,vec2(sdBox(lamp,vec3(.46,.07,.22)),7.));
  r=U(r,vec2(sdBox(lamp-vec3(0.,-.08,0.),vec3(.29,.035,.18)),8.));

  vec3 end=p-vec3(0.,0.,-20.45);
  r=U(r,vec2(sdCylZ(end,1.75,.20),5.));
  r=U(r,vec2(sdTorusZ(end,vec2(1.78,.16)),3.));
  float ang=atan(end.y,end.x);
  float seg=abs(fract((ang+PI)/(2.*PI)*10.)-.5);
  float blade=max(abs(length(end.xy)-1.05)-.55,seg-.30);
  blade=max(blade,abs(end.z)-.26);
  r=U(r,vec2(blade,6.));
  r=U(r,vec2(sdCylZ(end,.26,.34),8.));

  vec3 s=p-vec3(.52,-.28,3.42);
  s.xz*=rot(-.16);
  r=U(r,vec2(sdBox(s,vec3(.30,.26,.88)),9.));
  r=U(r,vec2(sdCylZ(s-vec3(0.,.03,-.84),.18,.22),9.));
  r=U(r,vec2(sdTorusZ(s-vec3(0.,.03,-.53),vec2(.23,.055)),10.));
  r=U(r,vec2(sdBox(s-vec3(.0,.28,-.08),vec3(.12,.17,.22)),10.));
  r=U(r,vec2(sdBox(s-vec3(.18,-.16,.18),vec3(.08,.26,.19)),9.));
  r=U(r,vec2(sdBox(s-vec3(-.18,-.16,.18),vec3(.08,.26,.19)),9.));
  r=U(r,vec2(sdBox(s-vec3(0.,.0,.78),vec3(.15,.14,.12)),8.));

  float dDeb=sdBox(p-vec3(sin(floor((p.z+18.)/2.4))*1.45,-1.51,mod(p.z+18.,2.4)-1.2),vec3(.24,.08,.34));
  if(p.z<1.5&&p.z>-19.) r=U(r,vec2(dDeb,3.));
  return r;
}

vec2 map(vec3 p){return uQuality<.5?mapPrimitive(p):mapEnhanced(p);}

vec3 normalAt(vec3 p){
  vec2 e=vec2(.002,0.);
  float d=map(p).x;
  return normalize(vec3(map(p+e.xyy).x-d,map(p+e.yxy).x-d,map(p+e.yyx).x-d));
}

float shadow(vec3 ro,vec3 rd,float maxT){
  if(uQuality<.5)return 1.;
  float res=1.,t=.035;
  for(int i=0;i<12;i++){
    float h=map(ro+rd*t).x;
    res=min(res,14.*h/t);
    t+=clamp(h,.02,.34);
    if(h<.001||t>maxT)break;
  }
  return clamp(res,.15,1.);
}

vec3 baseMaterial(float m,vec3 p,vec3 n){
  float grime=noise3(p*3.2);
  float fine=noise3(p*14.0);
  if(uQuality<.5){
    if(m<1.5)return vec3(.26,.27,.28);
    if(m<2.5)return vec3(.20,.22,.23);
    if(m<4.)return vec3(.29,.31,.32);
    return vec3(.18,.20,.21);
  }
  vec3 c;
  if(m<1.5)c=vec3(.25,.27,.27);
  else if(m<2.5)c=vec3(.17,.19,.20);
  else if(m<3.5)c=vec3(.22,.16,.12);
  else if(m<4.5)c=vec3(.16,.19,.20);
  else if(m<5.5)c=vec3(.10,.12,.13);
  else if(m<6.5)c=vec3(.27,.25,.22);
  else if(m<7.5)c=vec3(.12,.15,.16);
  else if(m<8.5)c=vec3(1.25,.42,.08);
  else if(m<9.5)c=vec3(.19,.22,.23);
  else c=vec3(.12,.18,.20);
  float wear=.78+.28*grime+.10*fine;
  if(m<7.5)c*=wear;
  if(m>2.5&&m<4.5)c=mix(c,vec3(.34,.13,.05),smoothstep(.62,.9,grime)*.45);
  float edge=pow(1.-abs(dot(n,normalize(vec3(.3,.8,.2)))),3.);
  c+=edge*.025;
  return c;
}

vec3 pointLight(vec3 p,vec3 n,vec3 v,vec3 lp,vec3 lc,float power,float shadowOn){
  vec3 l=lp-p;float dist=length(l);l/=dist;
  float ndl=max(dot(n,l),0.);
  float att=power/(1.+dist*dist*.32);
  float sh=shadowOn>.5?shadow(p+n*.012,l,dist):1.;
  vec3 h=normalize(l+v);
  float spec=pow(max(dot(n,h),0.),uQuality<.5?18.:52.)*(uQuality<.5?.08:.24);
  return lc*(ndl+spec)*att*sh;
}

vec3 shade(vec3 p,vec3 rd,float m,float travel){
  vec3 n=normalAt(p),v=-rd,c=baseMaterial(m,p,n);
  vec3 light=vec3(.045,.055,.065);
  if(uQuality<.5){
    vec3 l=normalize(vec3(-.45,.75,.35));
    light+=vec3(.72,.68,.62)*max(dot(n,l),0.)*.72;
  }else{
    light+=pointLight(p,n,v,vec3(0.,1.45,-.2),vec3(1.0,.42,.12),5.0,1.);
    light+=pointLight(p,n,v,vec3(0.,1.45,-8.2),vec3(1.0,.35,.09),5.5,0.);
    light+=pointLight(p,n,v,vec3(0.,1.45,-16.2),vec3(.95,.32,.08),5.0,0.);
    light+=pointLight(p,n,v,vec3(0.,.1,-20.1),vec3(.10,.72,1.0),4.8,0.);
    float ao=clamp(.45+.55*(1.-noise3(p*1.6)*.35),.45,1.);
    light*=ao;
  }
  vec3 col=c*light;
  if(m>7.5&&m<8.5)col+=vec3(1.6,.32,.045)*(uQuality<.5?.1:1.1);
  float fog=1.-exp(-travel*(uQuality<.5?.018:.032));
  vec3 fogCol=uQuality<.5?vec3(.055,.065,.072):vec3(.025,.038,.045);
  col=mix(col,fogCol,fog);
  if(uDebug>.5&&uQuality>.5){
    vec3 dbg=vec3(fract(m*.31),fract(m*.53),fract(m*.79));
    col=mix(col,dbg,.42);
  }
  return col;
}

vec3 render(vec2 uv){
  float aspect=uResolution.x/uResolution.y;
  uv.x*=aspect;
  vec3 ro=vec3(0.,.08,5.3);
  float yaw=uLook.x*.22,pitch=uLook.y*.16;
  vec3 rd=normalize(vec3(uv.x,uv.y,-1.52));
  rd.xz*=rot(yaw);
  rd.yz*=rot(-pitch);
  float t=0.;float m=0.;
  int steps=uQuality<.5?46:68;
  for(int i=0;i<100;i++){
    if(i>=steps)break;
    vec2 h=map(ro+rd*t);m=h.y;
    if(h.x<.0015||t>FAR)break;
    t+=h.x*(uQuality<.5?.86:.72);
  }
  vec3 col;
  if(t>FAR)col=vec3(.012,.018,.022);
  else col=shade(ro+rd*t,rd,m,t);
  if(uQuality>.5){
    float vign=1.-dot(uv*.42,uv*.42);
    col*=clamp(vign,.55,1.);
    float grain=(hash21(gl_FragCoord.xy+vec2(17.0,29.0))-.5)*.018;
    col+=grain;
    col=pow(max(col,0.),vec3(.82));
  }else{
    col=pow(max(col,0.),vec3(.92));
  }
  return col;
}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uResolution.xy)/uResolution.y;
  vec3 col=render(uv);
  outColor=vec4(col,1.);
}`;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const U = {
  resolution: gl.getUniformLocation(program, 'uResolution'),
  time: gl.getUniformLocation(program, 'uTime'),
  quality: gl.getUniformLocation(program, 'uQuality'),
  look: gl.getUniformLocation(program, 'uLook'),
  debug: gl.getUniformLocation(program, 'uDebug')
};

const recipe = createQualitySceneRecipe(424242);
let profile = 'krieger_class';
let debug = false;
let look = {x:0,y:0};
let drag = null;
const dpr = Math.max(1, Math.min(1.3, devicePixelRatio || 1));
const reports = {
  primitive: analyzeGraphicsQuality(compileQualityScene(recipe, 'primitive', {dpr: Math.max(1, devicePixelRatio || 1)})),
  krieger_class: analyzeGraphicsQuality(compileQualityScene(recipe, 'krieger_class', {dpr: Math.max(1, devicePixelRatio || 1)}))
};

function noticeScore() {
  const a = reports.primitive.metrics, b = reports.krieger_class.metrics;
  const keys = ['spatialDepth','silhouetteComplexity','semanticDetail','secondaryGeometry','materialVariation','lightingResponse','nearObjectComplexity','environmentDetail'];
  const lift = keys.map(k => Math.max(0, (b[k]-a[k]) / Math.max(.01, 1-a[k])));
  const score = Math.round(Math.min(1, lift.reduce((s,v)=>s+v,0)/lift.length*1.42)*100);
  return score;
}
window.__graphicsQualityEvidence = {recipe, reports, noticeScore:noticeScore(), fingerprints:{
  primitive: qualityFingerprint(reports.primitive),
  krieger_class: qualityFingerprint(reports.krieger_class)
}};

function resize() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv?.width || innerWidth));
  const h = Math.max(1, Math.round(vv?.height || innerHeight));
  canvas.style.width = w+'px'; canvas.style.height = h+'px';
  const mobile = w < 700;
  const scale = mobile ? .58 : .76;
  canvas.width = Math.max(320, Math.round(w*dpr*scale));
  canvas.height = Math.max(320, Math.round(h*dpr*scale));
  gl.viewport(0,0,canvas.width,canvas.height);
}
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);

const primitiveBtn=document.getElementById('primitive');
const enhancedBtn=document.getElementById('enhanced');
const reportBtn=document.getElementById('reportBtn');
const reportEl=document.getElementById('report');
const debugBtn=document.getElementById('debugBtn');
const debugEl=document.getElementById('debug');

function setProfile(next){
  profile=next;
  primitiveBtn.classList.toggle('active',profile==='primitive');
  enhancedBtn.classList.toggle('active',profile==='krieger_class');
  resize();
  renderReport();
  requestRender();
}
primitiveBtn.onclick=()=>setProfile('primitive');
enhancedBtn.onclick=()=>setProfile('krieger_class');
reportBtn.onclick=()=>reportEl.classList.toggle('show');
debugBtn.onclick=()=>{
  debug=!debug;
  debugBtn.textContent=debug?'HIDE DEBUG':'SHOW DEBUG';
  debugEl.classList.toggle('show',debug);
  requestRender();
};

function renderReport(){
  const r=reports[profile];
  const gates=Object.entries(r.gates).map(([k,v])=>`<div class="gate"><span>${k}</span><b class="${v?'pass':'fail'}">${v?'PASS':'FAIL'}</b></div>`).join('');
  const metricNames=['semanticDetail','secondaryGeometry','materialVariation','lightingResponse','nearObjectComplexity','environmentDetail','spatialDepth','flatSurfaceRatio','triangles','drawCalls'];
  const metrics=metricNames.map(k=>`<div class="metric">${k}<b>${r.metrics[k]}</b></div>`).join('');
  const failures=r.failures.length?r.failures.map(f=>`<div class="fail" style="font-size:10px;margin:5px 0">• ${f.gate}: ${f.reason}</div>`).join(''):'<div class="pass" style="font-size:10px">All configured gates pass for this candidate.</div>';
  const referenceStatus=profile==='krieger_class'?'REFERENCE FIDELITY: USER VERIFICATION REQUIRED':'REFERENCE FIDELITY: NOT APPLICABLE';
  reportEl.innerHTML=`<h2>${profile==='primitive'?'PRIMITIVE / OLD':'ENHANCED / KRIEGER-CLASS CANDIDATE'}</h2>
  <div id="statusline" class="${r.passed?'pass':'fail'}">GOVERNOR GATES: ${r.passed?'PASS':'FAIL'} · ${r.status}</div>
  <div style="font-size:10px;color:#aab3bd;margin-bottom:4px">${referenceStatus}</div>
  <div style="font-size:10px;color:#aab3bd;margin-bottom:8px">A/B noticeability: ${noticeScore()} / 100 · fingerprint ${qualityFingerprint(r)}</div>
  ${gates}<div class="metrics">${metrics}</div><div style="margin-top:10px">${failures}</div>`;
}
renderReport();
setProfile('krieger_class');

canvas.addEventListener('pointerdown',e=>{
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,lx:look.x,ly:look.y};
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  look.x=Math.max(-1,Math.min(1,drag.lx+(e.clientX-drag.x)/180));
  look.y=Math.max(-1,Math.min(1,drag.ly+(e.clientY-drag.y)/180));
  requestRender();
});
canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null});
canvas.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null});

const perfEl=document.getElementById('fps');
var renderQueued=false;
function frame(now){
  renderQueued=false;
  const started=performance.now();
  gl.useProgram(program);
  gl.uniform2f(U.resolution,canvas.width,canvas.height);
  gl.uniform1f(U.time,now*.001);
  gl.uniform1f(U.quality,profile==='krieger_class'?1:0);
  gl.uniform2f(U.look,look.x,look.y);
  gl.uniform1f(U.debug,debug?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.finish();
  const frameMs=performance.now()-started;
  perfEl.innerHTML='ON-DEMAND<br>WEBGL2';
  window.__graphicsQualityEvidence.runtime={frameMs,width:canvas.width,height:canvas.height,mode:'on-demand',timingReliability:'diagnostic-only'};
}
function requestRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(frame)}
resize();requestRender();
