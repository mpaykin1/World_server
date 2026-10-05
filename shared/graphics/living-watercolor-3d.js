// Living Watercolor 3D — deterministic NPR layer for Three.js scenes.
// No external assets: paper grain, ink wobble and brush sprites are procedural.
const DEFAULT_STYLE=Object.freeze({
  inkColor:'#24364f',paperColor:'#f6f1e7',washColor:'#8794a4',
  washOpacity:.72,washLayers:6,edgeWidth:.022,edgeJitter:.17,
  granulation:.26,bleed:.16,shadowWash:.16,motion:.18,pigmentPooling:.24,paperGap:.13,paintedLight:.48,seed:73194217,
  lod:{near:18,mid:42,far:82,billboard:140}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const lerp=(a,b,t)=>a+(b-a)*t;

export function stableSeed(value=0){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
export function hash01(x=0,y=0,z=0,seed=0){
  let h=(Math.imul((x*997)|0,374761393)^Math.imul((y*991)|0,668265263)^Math.imul((z*983)|0,2147483647)^(seed|0))|0;
  h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967295;
}
export function coherentWobble(seed,timeMs=0,speed=.00018){
  const s=(stableSeed(seed)%10000)*.001;
  return Math.sin(timeMs*speed+s)*.68+Math.sin(timeMs*speed*.47+s*1.73)*.32;
}
function validHex(value,fallback){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback;}
export function createWatercolorStyle(overrides={}){
  const lod={...DEFAULT_STYLE.lod,...(overrides.lod||{})};
  return Object.freeze({
    ...DEFAULT_STYLE,...overrides,
    inkColor:validHex(overrides.inkColor,DEFAULT_STYLE.inkColor),
    paperColor:validHex(overrides.paperColor,DEFAULT_STYLE.paperColor),
    washColor:validHex(overrides.washColor,DEFAULT_STYLE.washColor),
    washOpacity:clamp(overrides.washOpacity??DEFAULT_STYLE.washOpacity,.05,1),
    washLayers:Math.round(clamp(overrides.washLayers??DEFAULT_STYLE.washLayers,1,12)),
    edgeWidth:clamp(overrides.edgeWidth??DEFAULT_STYLE.edgeWidth,.002,.08),
    edgeJitter:clamp(overrides.edgeJitter??DEFAULT_STYLE.edgeJitter,0,.5),
    granulation:clamp(overrides.granulation??DEFAULT_STYLE.granulation,0,.8),
    bleed:clamp(overrides.bleed??DEFAULT_STYLE.bleed,0,.7),
    shadowWash:clamp(overrides.shadowWash??DEFAULT_STYLE.shadowWash,0,.6),
    motion:clamp(overrides.motion??DEFAULT_STYLE.motion,0,.8),
    pigmentPooling:clamp(overrides.pigmentPooling??DEFAULT_STYLE.pigmentPooling,0,.8),
    paperGap:clamp(overrides.paperGap??DEFAULT_STYLE.paperGap,0,.6),
    paintedLight:clamp(overrides.paintedLight??DEFAULT_STYLE.paintedLight,0,1),
    seed:stableSeed(overrides.seed??DEFAULT_STYLE.seed),lod:Object.freeze(lod)
  });
}
export function watercolorLodForDistance(distance,lod=DEFAULT_STYLE.lod){
  const d=Math.max(0,Number(distance)||0);
  if(d<=lod.near)return'near';if(d<=lod.mid)return'mid';
  if(d<=lod.far)return'far';return'budget';
}

function colorVec3(THREE,hex){const c=new THREE.Color(hex);return new THREE.Vector3(c.r,c.g,c.b);}
function makeCanvas(size){
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(size,size);
  if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=size;return c;}
  return null;
}
function makeBrushTexture(THREE,style,seed=0,size=128){
  const canvas=makeCanvas(size);if(!canvas)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const rng=n=>hash01(n,n*7,n*13,seed);
  ctx.clearRect(0,0,size,size);ctx.globalCompositeOperation='source-over';
  for(let i=0;i<26;i++){
    const x=size*(.5+(rng(i)-.5)*.18),y=size*(.5+(rng(i+31)-.5)*.18);
    const rx=size*(.28+rng(i+67)*.18),ry=size*(.18+rng(i+91)*.22);
    ctx.save();ctx.translate(x,y);ctx.rotate((rng(i+121)-.5)*.7);
    ctx.globalAlpha=.025+rng(i+151)*.035;ctx.fillStyle=style.inkColor;
    ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.needsUpdate=true;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;return texture;
}
function makeWashTexture(THREE,style,seed=0,size=192){
  const canvas=makeCanvas(size);if(!canvas)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
  for(let i=0;i<44;i++){
    const x=hash01(i,41,7,seed)*size,y=hash01(i,43,11,seed)*size;
    const rx=size*(.08+hash01(i,47,13,seed)*.22),ry=size*(.06+hash01(i,53,17,seed)*.18);
    const a=.035+hash01(i,59,19,seed)*.095;
    ctx.save();ctx.translate(x,y);ctx.rotate((hash01(i,61,23,seed)-.5)*1.2);
    ctx.fillStyle=`rgba(70,88,112,${a})`;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  for(let i=0;i<20;i++){
    const x=hash01(i,67,29,seed)*size,y=hash01(i,71,31,seed)*size,r=size*(.035+hash01(i,73,37,seed)*.09);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.20)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.8,1.8);
  if('colorSpace' in texture)texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

function makePaperTexture(THREE,style,seed=0,size=128){
  const canvas=makeCanvas(size);if(!canvas)return null;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle=style.paperColor;ctx.fillRect(0,0,size,size);
  for(let i=0;i<260;i++){
    const a=.012+hash01(i,7,9,seed)*.022,x=hash01(i,11,5,seed)*size,y=hash01(i,17,3,seed)*size;
    ctx.strokeStyle=`rgba(36,54,79,${a})`;ctx.lineWidth=.35+hash01(i,23,2,seed)*.7;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+6+hash01(i,29,1,seed)*24,y+(hash01(i,31,4,seed)-.5)*2);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat?.set?.(7,7);texture.needsUpdate=true;return texture;
}
function patchWatercolorMaterial(THREE,material,style,seed,states,washTexture){
  if(!material||material.userData?.livingWatercolorPatched)return material;
  if(!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial&&!material.isMeshLambertMaterial)return material;
  const m=material.clone();m.userData={...(material.userData||{}),livingWatercolorPatched:true};
  const state={uniforms:null,seed:stableSeed(seed),baseOpacity:Number(m.opacity??1)};states.add(state);
  const previous=m.onBeforeCompile,previousKey=m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile=(shader,...rest)=>{
    previous?.(shader,...rest);
    Object.assign(shader.uniforms,{
      uWcTime:{value:0},uWcSeed:{value:(state.seed%10000)/10000},
      uWcPaper:{value:colorVec3(THREE,style.paperColor)},uWcInk:{value:colorVec3(THREE,style.inkColor)},uWcWashColor:{value:colorVec3(THREE,style.washColor)},
      uWcWash:{value:style.washOpacity},uWcGran:{value:style.granulation},uWcBleed:{value:style.bleed},uWcQuality:{value:1},
      uWcPool:{value:style.pigmentPooling},uWcPaperGap:{value:style.paperGap},uWcPaintedLight:{value:style.paintedLight}
    });
    state.uniforms=shader.uniforms;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWcWorld;\nvarying vec3 vWcNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWcWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvWcNormal=normalize(normalMatrix*objectNormal);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vWcWorld;\nvarying vec3 vWcNormal;\nuniform float uWcTime,uWcSeed,uWcWash,uWcGran,uWcBleed,uWcQuality,uWcPool,uWcPaperGap,uWcPaintedLight;\nuniform vec3 uWcPaper,uWcInk,uWcWashColor;\nfloat wcHash(vec3 p){p=fract(p*.1031+uWcSeed);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}`);
    const needle='#include <color_fragment>';
    if(shader.fragmentShader.includes(needle))shader.fragmentShader=shader.fragmentShader.replace(needle,`${needle}\nfloat wcFlow1=sin(dot(vWcWorld,vec3(1.73,2.11,.87))+uWcSeed*19.0);\nfloat wcFlow2=sin(dot(vWcWorld,vec3(-2.37,.91,1.41))+uWcSeed*11.0);\nfloat wcFlow3=sin(dot(vWcWorld,vec3(.63,-1.57,2.83))+uWcSeed*7.0);\nfloat wcGrain=sin(dot(vWcWorld,vec3(7.7,6.3,8.9))+uWcSeed*29.0)*.5+.5;\nfloat wcFlow=(wcFlow1+wcFlow2*.72+wcFlow3*.48)/2.2;\nvec3 wcN=normalize(vWcNormal);\nfloat wcRim=pow(1.0-clamp(abs(wcN.z),0.0,1.0),1.65);\nfloat wcDown=smoothstep(.12,.92,1.0-max(wcN.y,0.0));\nfloat wcPool=wcRim*uWcPool+wcDown*uWcPool*.32;\nfloat wcGap=smoothstep(.46,.95,wcFlow*.5+.5+(wcGrain-.5)*.30)*uWcPaperGap;\nfloat wcDensity=clamp(uWcWash+wcFlow*uWcGran*.62+(wcGrain-.5)*uWcBleed*.34+wcPool-wcGap,.10,.98);\nvec3 wcPigment=mix(uWcWashColor,diffuseColor.rgb,.42);\nfloat wcLight=.70+.30*(wcN.y*.5+.5);\nvec3 wcPaint=mix(uWcPaper,wcPigment,wcDensity);\nwcPaint=mix(wcPaint,wcPaint*wcLight,(1.0-uWcPaintedLight)*.35);\ndiffuseColor.rgb=wcPaint;`);
    if(shader.fragmentShader.includes('#include <opaque_fragment>'))shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight,diffuseColor.rgb,uWcPaintedLight);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey=()=>`${previousKey?.()||''}|living-watercolor-3d:${state.seed}:${style.washOpacity}`;
  m.roughness=Math.max(Number(m.roughness??.85),.92);m.metalness=Math.min(Number(m.metalness??0),.03);m.needsUpdate=true;
  return m;
}
function addInkShell(THREE,mesh,style,seed,outlineStates){
  if(mesh.userData?.livingWatercolorOutline||!mesh.geometry?.attributes?.normal)return null;
  const shells=[],passes=[[.82,.22],[1.0,.34],[1.24,.18]];
  for(let pass=0;pass<passes.length;pass++){
    const [widthScale,opacity]=passes[pass],passSeed=stableSeed(`${seed}:${pass}`);
    const uniforms={uTime:{value:0},uSeed:{value:(passSeed%10000)/10000},uWidth:{value:style.edgeWidth*widthScale},uJitter:{value:style.edgeJitter},uOpacity:{value:opacity},uInk:{value:colorVec3(THREE,style.inkColor)}};
    const material=new THREE.ShaderMaterial({
      uniforms,side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:true,
      vertexShader:`uniform float uTime,uSeed,uWidth,uJitter;\nfloat h(vec3 p){p=fract(p*.1031+uSeed);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}\nvoid main(){float n=h(position*4.2),n2=h(position*11.7+vec3(uSeed));float breathe=sin(uTime*.11+uSeed*31.0)*.22;float w=uWidth*(.88+(n-.5)*uJitter*1.25+(n2-.5)*uJitter*.45+breathe*uJitter);vec3 p=position+normal*w;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
      fragmentShader:`uniform vec3 uInk;uniform float uOpacity;void main(){gl_FragColor=vec4(uInk,uOpacity);}`
    });
    const shell=new THREE.Mesh(mesh.geometry,material);shell.name='__livingWatercolorOutline';
    shell.frustumCulled=mesh.frustumCulled;shell.renderOrder=(mesh.renderOrder||0)-1-pass;shell.userData.livingWatercolorOutline=true;
    mesh.add(shell);outlineStates.add({mesh:shell,uniforms,baseOpacity:opacity});shells.push(shell);
  }
  return shells;
}

function hexRgb(hex){
  const n=parseInt(String(hex||'#000000').slice(1),16);
  return[(n>>16)&255,(n>>8)&255,n&255];
}
function createPaperCompositor(sourceCanvas,style,getQuality,{replaceSource=false,getReferenceProfile=null}={}){
  if(typeof document==='undefined'||!sourceCanvas?.parentNode)return null;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
  const work=document.createElement('canvas'),wctx=work.getContext('2d',{willReadFrequently:true});
  const paint=document.createElement('canvas'),pctx=paint.getContext('2d');
  const maskCanvas=document.createElement('canvas'),mctx=maskCanvas.getContext('2d');
  const blobs=document.createElement('canvas'),bctx=blobs.getContext('2d');
  if(!ctx||!wctx||!pctx||!mctx||!bctx)return null;
  canvas.dataset.livingWatercolorCompositor='true';
  Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',pointerEvents:'none',zIndex:'1',mixBlendMode:'normal'});
  sourceCanvas.parentNode.insertBefore(canvas,sourceCanvas.nextSibling);
  const oldOpacity=sourceCanvas.style.opacity;if(replaceSource)sourceCanvas.style.opacity='0';
  let w=0,h=0,cw=0,ch=0,lastPresent=-1,out=null,lums=null,washField=null,maskImage=null;
  const paper=hexRgb(style.paperColor),pigment=hexRgb(style.washColor),ink=hexRgb(style.inkColor);
  const paperL=paper[0]*.2126+paper[1]*.7152+paper[2]*.0722,seed=style.seed|0;
  function buildWashField(){
    washField=new Float32Array(cw*ch);washField.fill(.48);
    for(let k=0;k<22;k++){
      const cx=hash01(k,3,7,seed)*cw,cy=hash01(k,5,11,seed)*ch;
      const rx=(.07+hash01(k,13,17,seed)*.22)*cw,ry=(.05+hash01(k,19,23,seed)*.18)*ch;
      const amp=(hash01(k,29,31,seed)-.42)*.62;
      const x0=Math.max(0,Math.floor(cx-rx*1.15)),x1=Math.min(cw-1,Math.ceil(cx+rx*1.15));
      const y0=Math.max(0,Math.floor(cy-ry*1.15)),y1=Math.min(ch-1,Math.ceil(cy+ry*1.15));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const dx=(x-cx)/rx,dy=(y-cy)/ry,d=dx*dx+dy*dy;if(d>=1.25)continue;
        washField[y*cw+x]+=amp*Math.pow(Math.max(0,1-d/1.25),2);
      }
    }
    let lo=Infinity,hi=-Infinity;for(const v of washField){if(v<lo)lo=v;if(v>hi)hi=v;}
    const span=Math.max(.001,hi-lo);for(let i=0;i<washField.length;i++)washField[i]=clamp((washField[i]-lo)/span,0,1);
  }
  function resize(){
    const nw=innerWidth||1,nh=innerHeight||1,q=clamp(getQuality?.()??1,.35,1);
    const scale=.40+.20*q,ncw=Math.max(128,Math.round(nw*scale)),nch=Math.max(128,Math.round(nh*scale));
    if(nw===w&&nh===h&&ncw===cw&&nch===ch)return;
    w=nw;h=nh;cw=ncw;ch=nch;canvas.width=w;canvas.height=h;work.width=paint.width=maskCanvas.width=blobs.width=cw;work.height=paint.height=maskCanvas.height=blobs.height=ch;
    out=wctx.createImageData(cw,ch);maskImage=mctx.createImageData(cw,ch);lums=new Float32Array(cw*ch);ctx.imageSmoothingEnabled=true;buildWashField();
  }
  function present(timeMs=performance.now()){
    resize();const q=clamp(getQuality?.()??1,.35,1),minDelta=1000/(18+10*q);
    if(lastPresent>=0&&timeMs-lastPresent<minDelta)return;lastPresent=timeMs;
    wctx.clearRect(0,0,cw,ch);wctx.drawImage(sourceCanvas,0,0,cw,ch);
    const src=wctx.getImageData(0,0,cw,ch).data,dst=out.data;
    for(let i=0,p=0;i<src.length;i+=4,p++)lums[p]=src[i]*.2126+src[i+1]*.7152+src[i+2]*.0722;
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
      const p=y*cw+x,i=p*4,r=src[i],g=src[i+1],b=src[i+2],lum=lums[p];
      const dr=r-paper[0],dg=g-paper[1],db=b-paper[2],dist=Math.sqrt(dr*dr+dg*dg+db*db);
      const mask=clamp((dist-5)/44,0,1);
      const l=lums[y*cw+Math.max(0,x-1)],rr=lums[y*cw+Math.min(cw-1,x+1)];
      const u=lums[Math.max(0,y-1)*cw+x],d=lums[Math.min(ch-1,y+1)*cw+x];
      const grad=Math.hypot((rr-l)*.5,(d-u)*.5),edge=clamp((grad-5)/26,0,1)*mask;
      const darkness=clamp((paperL-lum-34)/118,0,1)*mask;
      const blot=washField[p],sourceDark=clamp((paperL-lum)/128,0,1),washAlpha=clamp(.30+sourceDark*.34+(blot-.5)*.42,.16,.82);
      const lift=(lum<135?clamp((176-lum)/126,0,.28):clamp((188-lum)/132,0,.46))*(1-edge*.82);
      const sr=r*(1-lift)+paper[0]*lift,sg=g*(1-lift)+paper[1]*lift,sb=b*(1-lift)+paper[2]*lift;
      const pigmentMix=clamp(.40+sourceDark*.10+(blot-.5)*.24,.28,.60);
      const pr=pigment[0]*pigmentMix+sr*(1-pigmentMix),pg=pigment[1]*pigmentMix+sg*(1-pigmentMix),pb=pigment[2]*pigmentMix+sb*(1-pigmentMix);
      const a=mask*washAlpha;
      let ro=paper[0]*(1-a)+pr*a,go=paper[1]*(1-a)+pg*a,bo=paper[2]*(1-a)+pb*a;
      const structureDark=clamp((138-lum)/78,0,1)*mask;
      const preserve=structureDark*.30;ro=ro*(1-preserve)+r*preserve;go=go*(1-preserve)+g*preserve;bo=bo*(1-preserve)+b*preserve;
      const inkAmount=clamp(edge*.68+darkness*.16,0,.80);
      ro=ro*(1-inkAmount)+ink[0]*inkAmount;go=go*(1-inkAmount)+ink[1]*inkAmount;bo=bo*(1-inkAmount)+ink[2]*inkAmount;
      const grain=(hash01(x,y,1,seed)-.5)*2.4*(1-mask*.55);
      dst[i]=clamp(ro+grain,0,255);dst[i+1]=clamp(go+grain,0,255);dst[i+2]=clamp(bo+grain,0,255);dst[i+3]=255;
      maskImage.data[i]=maskImage.data[i+1]=maskImage.data[i+2]=255;maskImage.data[i+3]=Math.round(mask*255);
    }

    const reference=typeof getReferenceProfile==='function'?getReferenceProfile():null;
    if(reference){
      const total=cw*ch,targetFg=Math.max(1,Math.min(total,Math.round(reference.foregroundCoverage*total)));
      const signalHist=new Uint32Array(256),signal=new Uint8Array(total),candidate=new Uint8Array(total),outLum=new Float32Array(total);let candidateCount=0;
      for(let p=0,i=0;p<total;p++,i+=4){
        const d=Math.hypot(dst[i]-paper[0],dst[i+1]-paper[1],dst[i+2]-paper[2]),ma=maskImage.data[i+3];
        if(ma>=52){candidate[p]=1;candidateCount++;const s=Math.max(ma,Math.min(255,Math.round(d*4)));signal[p]=s;signalHist[s]++;}
        outLum[p]=dst[i]*.2126+dst[i+1]*.7152+dst[i+2]*.0722;
      }
      const wanted=Math.min(targetFg,candidateCount);let need=wanted,fgCut=255;
      for(let s=255;s>=0;s--){if(need<=signalHist[s]){fgCut=s;break;}need-=signalHist[s];}
      const selected=new Uint8Array(total);let fgCount=0;
      for(let p=0;p<total;p++)if(candidate[p]&&(signal[p]>fgCut||(signal[p]===fgCut&&fgCount<wanted))){selected[p]=1;fgCount++;}
      const hist=new Uint32Array(256);
      for(let p=0;p<total;p++)if(selected[p])hist[Math.max(0,Math.min(255,Math.round(outLum[p])))]++;
      const inkNeed=Math.round(reference.inkCoverage*total),midNeed=Math.round(reference.midWashCoverage*total);
      function quantile(count){let acc=0;for(let l=0;l<256;l++){acc+=hist[l];if(acc>=count)return l;}return 255;}
      const qInk=quantile(Math.min(fgCount,inkNeed)),qMid=Math.max(qInk+1,quantile(Math.min(fgCount,midNeed)));
      const inkT=paperL-45,midT=paperL-18;
      const band=new Uint8Array(total),mapped=new Float32Array(total);
      let sum=0,sum2=0,n=0;
      for(let p=0;p<total;p++){
        const i=p*4;if(!selected[p]){dst[i]=paper[0];dst[i+1]=paper[1];dst[i+2]=paper[2];continue;}
        const l=outLum[p];let t,b;
        if(l<=qInk){b=1;const u=qInk>0?l/qInk:0;t=88+u*(inkT-3-88);}
        else if(l<=qMid){b=2;const u=(l-qInk)/Math.max(1,qMid-qInk);t=inkT+2+u*(midT-3-(inkT+2));}
        else{b=3;const u=(l-qMid)/Math.max(1,255-qMid);t=midT+2+u*(236-(midT+2));}
        band[p]=b;mapped[p]=t;sum+=t;sum2+=t*t;n++;
      }
      for(let iter=0;iter<3&&n;iter++){
        const mean=sum/n,std=Math.sqrt(Math.max(.001,sum2/n-mean*mean)),matchMean=reference.lumaMean+(reference.matchMeanBias||0),matchStd=reference.lumaStd+(reference.matchStdBias||0),gain=matchStd/Math.max(1,std);
        sum=0;sum2=0;
        for(let p=0;p<total;p++)if(selected[p]){
          let t=matchMean+(mapped[p]-mean)*gain;
          if(band[p]===1)t=clamp(t,62,inkT-1);
          else if(band[p]===2)t=clamp(t,inkT+1,midT-1);
          else t=clamp(t,midT+1,238);
          mapped[p]=t;sum+=t;sum2+=t*t;
        }
      }
      const edgeMap=new Float32Array(total);let edgeCount=0;
      for(let y=1;y<ch-1;y++)for(let x=1;x<cw-1;x++){const p=y*cw+x;if(!selected[p])continue;
        const gx=(mapped[p+1]-mapped[p-1])*.5,gy=(mapped[p+cw]-mapped[p-cw])*.5,e=Math.hypot(gx,gy);edgeMap[p]=e;if(e>10)edgeCount++;
      }
      const curEdge=fgCount?edgeCount/fgCount:0,targetEdge=(reference.edgeDensityForeground||curEdge)+(reference.matchEdgeBias||0);
      const sharpen=clamp((targetEdge-curEdge)*18,-.70,1.65);
      for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const p=y*cw+x,i=p*4;if(!selected[p])continue;
        let t=mapped[p];
        if(x>0&&x<cw-1&&y>0&&y<ch-1&&sharpen!==0){
          const avg=(mapped[p-1]+mapped[p+1]+mapped[p-cw]+mapped[p+cw])*.25;t+=sharpen*(t-avg);
          if(band[p]===1)t=clamp(t,58,inkT-1);else if(band[p]===2)t=clamp(t,inkT+1,midT-1);else t=clamp(t,midT+1,240);
        }
        const old=Math.max(1,outLum[p]),ratio=t/old;
        let rr=dst[i]*ratio,gg=dst[i+1]*ratio,bb=dst[i+2]*ratio;
        const mix=band[p]===1?.16:band[p]===2?.11:.06;
        const bc=band[p]===1?ink:pigment;rr=rr*(1-mix)+bc[0]*mix;gg=gg*(1-mix)+bc[1]*mix;bb=bb*(1-mix)+bc[2]*mix;
        const actual=Math.max(1,rr*.2126+gg*.7152+bb*.0722),fix=t/actual;dst[i]=clamp(rr*fix,0,255);dst[i+1]=clamp(gg*fix,0,255);dst[i+2]=clamp(bb*fix,0,255);
        maskImage.data[i]=maskImage.data[i+1]=maskImage.data[i+2]=255;maskImage.data[i+3]=255;
      }
    }

    pctx.putImageData(out,0,0);mctx.putImageData(maskImage,0,0);
    bctx.clearRect(0,0,cw,ch);bctx.globalCompositeOperation='source-over';
    for(let k=0;k<30;k++){
      const bx=hash01(k,71,3,seed)*cw,by=hash01(k,73,5,seed)*ch;
      const brx=(.035+hash01(k,79,7,seed)*.16)*cw,bry=(.028+hash01(k,83,11,seed)*.13)*ch;
      bctx.save();bctx.translate(bx,by);bctx.rotate((hash01(k,89,13,seed)-.5)*1.2);
      bctx.fillStyle=style.washColor;bctx.globalAlpha=.045+hash01(k,97,17,seed)*.105;
      bctx.beginPath();bctx.ellipse(0,0,brx,bry,0,0,Math.PI*2);bctx.fill();bctx.restore();
    }
    bctx.globalCompositeOperation='destination-in';bctx.globalAlpha=.88;bctx.drawImage(maskCanvas,0,0);bctx.globalCompositeOperation='source-over';
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.filter='none';ctx.fillStyle=style.paperColor;ctx.fillRect(0,0,w,h);
    ctx.drawImage(paint,0,0,w,h);
    ctx.globalCompositeOperation='multiply';ctx.globalAlpha=reference?.10:.88;ctx.drawImage(blobs,0,0,w,h);ctx.globalCompositeOperation='source-over';
    const passes=q>.78?3:q>.55?2:1;
    for(let i=0;i<passes;i++){
      const drift=Math.sin(timeMs*.00010+(seed%1000)*.01+i*1.7)*style.motion;
      const dx=(hash01(i,13,7,seed)-.5)*(1+style.bleed*3)+drift,dy=(hash01(i,17,11,seed)-.5)*(1+style.bleed*2)-drift*.4;
      ctx.globalAlpha=(.014+.011*i)*q;ctx.filter=`blur(${(.32+i*.24).toFixed(2)}px)`;ctx.drawImage(paint,dx,dy,w,h);
    }
    ctx.restore();
  }
  function captureImageData(){return ctx.getImageData(0,0,w,h);}
  function dispose(){if(replaceSource)sourceCanvas.style.opacity=oldOpacity;canvas.remove();}
  resize();return{canvas,present,resize,captureImageData,dispose,replaceSource};
}

export function createLivingWatercolor3D({THREE,renderer,scene,camera,style:inputStyle={},autoQuality=true}={}){
  if(!THREE||!renderer)throw new Error('LivingWatercolor3D: THREE + renderer required');
  const style=createWatercolorStyle(inputStyle),materialStates=new Set(),outlineStates=new Set(),emitters=new Set(),roots=new Set();
  let quality=1,disposed=false,compositor=null;
  renderer.setClearColor?.(style.paperColor,1);if(renderer.domElement?.style)renderer.domElement.style.background=style.paperColor;
  const paperTexture=makePaperTexture(THREE,style,style.seed),brushTexture=makeBrushTexture(THREE,style,style.seed^0x51f15e),washTexture=makeWashTexture(THREE,style,style.seed^0x7f4a7c15);
  if(paperTexture&&'colorSpace' in paperTexture)paperTexture.colorSpace=THREE.SRGBColorSpace;
  if(scene&&!scene.background)scene.background=paperTexture||new THREE.Color(style.paperColor);

  function apply(root,{seed=style.seed,outline=true}={}){
    if(!root)return root;roots.add(root);let i=0;
    root.traverse?.(obj=>{
      if(!obj?.isMesh||obj.userData?.livingWatercolorOutline)return;
      obj.userData=obj.userData||{};if(!obj.userData.__livingWatercolorOriginalMaterial)obj.userData.__livingWatercolorOriginalMaterial=obj.material;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      const patched=obj.userData.watercolorSkipWash?mats:mats.map((m,mi)=>patchWatercolorMaterial(THREE,m,style,stableSeed(`${seed}:${i}:${mi}`),materialStates,washTexture));
      obj.material=Array.isArray(obj.material)?patched:patched[0];
      if(outline&&obj.userData.watercolorOutline!==false)addInkShell(THREE,obj,style,stableSeed(`${seed}:ink:${i}`),outlineStates);i++;
    });
    return root;
  }
  function addGroundWash(parent,{x=0,y=.012,z=0,width=3,depth=2,opacity=style.shadowWash,seed=style.seed}={}){
    const tex=makeBrushTexture(THREE,style,stableSeed(seed),128)||brushTexture;
    const mat=new THREE.SpriteMaterial({map:tex,color:style.inkColor,transparent:true,opacity,depthWrite:false});
    const sprite=new THREE.Sprite(mat);sprite.name='__livingWatercolorGroundWash';sprite.position.set(x,y,z);sprite.scale.set(width,depth,1);sprite.material.rotation=0;
    const holder=new THREE.Group();holder.rotation.x=-Math.PI/2;holder.add(sprite);parent?.add?.(holder);return holder;
  }
  function createBrushEmitter({parent,origin=new THREE.Vector3(),count=9,scale=.8,rise=.42,spread=.35,wind=.08,seed=style.seed,opacity=.15}={}){
    const group=new THREE.Group();group.position.copy(origin);parent?.add?.(group);const particles=[];
    for(let i=0;i<count;i++){
      const s=stableSeed(`${seed}:${i}`),mat=new THREE.SpriteMaterial({map:brushTexture,color:style.inkColor,transparent:true,depthWrite:false,opacity});
      const sprite=new THREE.Sprite(mat),phase=hash01(i,2,3,s),life=.65+hash01(i,7,11,s)*.9;
      sprite.scale.setScalar(scale*(.65+hash01(i,13,17,s)*.7));group.add(sprite);particles.push({sprite,phase,life,s});
    }
    const emitter={group,particles,origin:origin.clone?.()||origin,rise,spread,wind,scale,opacity,seed:stableSeed(seed)};emitters.add(emitter);return emitter;
  }
  function updateEmitter(e,timeMs){
    const seconds=timeMs/1000;
    e.particles.forEach((p,i)=>{
      const t=(seconds*.18+p.phase)%1,fade=Math.sin(Math.PI*t),side=(hash01(i,23,29,p.s)-.5)*e.spread;
      p.sprite.position.set(side+e.wind*t*2,t*e.rise*8,(hash01(i,31,37,p.s)-.5)*e.spread);
      const s=e.scale*(.55+t*1.25);p.sprite.scale.setScalar(s);p.sprite.material.opacity=e.opacity*fade*(.7+.3*quality);
    });
  }
  function tick(timeMs=performance.now()){
    if(disposed)return;
    const seconds=timeMs/1000;
    for(const s of materialStates)if(s.uniforms){s.uniforms.uWcTime.value=seconds;s.uniforms.uWcQuality.value=quality;}
    for(const s of outlineStates){s.uniforms.uTime.value=seconds;const d=camera&&s.mesh.getWorldPosition?camera.position.distanceTo(s.mesh.getWorldPosition(new THREE.Vector3())):0;const lod=watercolorLodForDistance(d,style.lod);s.uniforms.uOpacity.value=s.baseOpacity*(lod==='near'?1:lod==='mid'?.8:lod==='far'?.52:.25);s.uniforms.uJitter.value=style.edgeJitter*(.72+.28*quality);}
    for(const e of emitters)updateEmitter(e,timeMs);
  }
  function setQuality(value){quality=clamp(value,.35,1);return quality;}
  function attachCompositor(options={}){if(!compositor)compositor=createPaperCompositor(renderer.domElement,style,()=>quality,options);return compositor;}
  function present(timeMs=performance.now()){compositor?.present?.(timeMs);}
  function captureImageData(){return compositor?.captureImageData?.()||null;}
  let qualityListener=null;
  if(autoQuality&&typeof window!=='undefined'){
    qualityListener=e=>setQuality(e?.detail?.quality??1);window.addEventListener('goldenqualitychange',qualityListener);
  }
  function diagnostics(){return{style,quality,roots:roots.size,materials:materialStates.size,outlines:outlineStates.size,emitters:emitters.size,paperTexture:Boolean(paperTexture),brushTexture:Boolean(brushTexture),washTexture:Boolean(washTexture)};}
  function dispose(){
    disposed=true;if(qualityListener&&typeof window!=='undefined')window.removeEventListener('goldenqualitychange',qualityListener);
    for(const s of outlineStates){s.mesh.material?.dispose?.();s.mesh.removeFromParent?.();}
    for(const e of emitters){for(const p of e.particles)p.sprite.material?.dispose?.();e.group.removeFromParent?.();}
    compositor?.dispose?.();compositor=null;paperTexture?.dispose?.();brushTexture?.dispose?.();washTexture?.dispose?.();outlineStates.clear();emitters.clear();materialStates.clear();roots.clear();
  }
  return{style,apply,tick,setQuality,addGroundWash,createBrushEmitter,attachCompositor,present,captureImageData,diagnostics,dispose,paperTexture,brushTexture,washTexture};
}

export{DEFAULT_STYLE};
