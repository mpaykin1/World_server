'use strict';
(function(){
  if(window.__WORLD_SERVER_VISUAL_ORACLE__) return;
  window.__WORLD_SERVER_VISUAL_ORACLE__ = {status:'pending'};
  const rollout=window.__QUALITY_ROLLOUT__||{};
  const sid=(()=>{try{return sessionStorage.getItem('world-server-qv-session')||(()=>{const v=(crypto.randomUUID?crypto.randomUUID():`qv-${Date.now()}-${Math.random().toString(36).slice(2)}`);sessionStorage.setItem('world-server-qv-session',v);return v})()}catch(_){return `qv-${Date.now()}`}})();
  const stable=[...sid].reduce((a,c)=>((a*33)^c.charCodeAt(0))>>>0,5381)%100;
  const pct=rollout.selected?35:12;
  if(stable>=pct){window.__WORLD_SERVER_VISUAL_ORACLE__={status:'not-sampled',sampled:false};return}
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function visible(el){
    try{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>=24&&r.height>=24&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>.02}catch(_){return false}
  }
  function domFallback(){
    const els=[...document.querySelectorAll('canvas,svg,img,video,[data-world-root],[data-game-root],main')].filter(visible).slice(0,80);
    let coverage=0;
    for(const el of els){const r=el.getBoundingClientRect();coverage+=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top))}
    const viewport=Math.max(1,innerWidth*innerHeight);
    return {status:'ready',sampled:true,mode:'dom-fallback',canvasCount:document.querySelectorAll('canvas').length,nonBlankRatio:clamp(coverage/viewport,0,1),lumaStddev:null,edgeDensity:null,signature:null,tainted:true};
  }
  function hash64(lumas){
    if(!lumas.length)return null;
    const sorted=[...lumas].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
    let bits='',hex='';
    for(let i=0;i<64;i++){const v=lumas[Math.floor(i*lumas.length/64)]??median;bits+=v>=median?'1':'0'}
    for(let i=0;i<bits.length;i+=4)hex+=parseInt(bits.slice(i,i+4),2).toString(16);
    return hex.padEnd(16,'0').slice(0,16);
  }
  function analyzeCanvas(source){
    const W=32,H=20,probe=document.createElement('canvas');probe.width=W;probe.height=H;
    const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,W,H);
    const data=ctx.getImageData(0,0,W,H).data,l=[],alive=[];
    let nonBlank=0;
    for(let i=0;i<data.length;i+=4){
      const a=data[i+3],y=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
      l.push(y);alive.push(a);if(a>8&&(y>4||data[i]>4||data[i+1]>4||data[i+2]>4))nonBlank++;
    }
    const mean=l.reduce((a,b)=>a+b,0)/l.length,variance=l.reduce((a,b)=>a+(b-mean)*(b-mean),0)/l.length;
    let edges=0,total=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(x+1<W){total++;if(Math.abs(l[i]-l[i+1])>28)edges++}if(y+1<H){total++;if(Math.abs(l[i]-l[i+W])>28)edges++}}
    return {status:'ready',sampled:true,mode:'canvas',nonBlankRatio:nonBlank/l.length,lumaStddev:Math.sqrt(variance)/255,edgeDensity:edges/Math.max(1,total),signature:hash64(l),tainted:false};
  }
  function run(){
    const canvases=[...document.querySelectorAll('canvas')].filter(visible).sort((a,b)=>(b.width*b.height)-(a.width*a.height));
    let result=null;
    for(const c of canvases.slice(0,4)){try{result=analyzeCanvas(c);if(result)break}catch(_){}}
    if(!result)result=domFallback();
    result.canvasCount=canvases.length;result.sampledAt=Date.now();
    window.__WORLD_SERVER_VISUAL_ORACLE__=result;
    try{dispatchEvent(new CustomEvent('world-server-visual-oracle',{detail:result}))}catch(_){}
  }
  const idle=globalThis.requestIdleCallback||(fn=>setTimeout(fn,1000));
  setTimeout(()=>idle(run,{timeout:2500}),4500);
})();