(() => {
  'use strict';
  const G=globalThis;if(G.WorldProceduralRecorder||typeof CanvasRenderingContext2D==='undefined')return;
  const store=new WeakMap(),MAX=1400;
  const get=c=>{let r=store.get(c);if(!r){r={commands:[],path:null,frame:0,lastFrame:performance.now()};store.set(c,r)}return r};
  const clone=c=>({type:c.type,x:c.x,y:c.y,w:c.w,h:c.h,r:c.r,rx:c.rx,ry:c.ry,style:c.style,alpha:c.alpha,t:c.t,m:c.m,signature:c.signature,frame:c.frame});
  function colorLum(s){if(!s)return 0;let r=0,g=0,b=0;if(/^#[0-9a-f]{3}$/i.test(s)){r=parseInt(s[1]+s[1],16);g=parseInt(s[2]+s[2],16);b=parseInt(s[3]+s[3],16)}else if(/^#[0-9a-f]{6}$/i.test(s)){r=parseInt(s.slice(1,3),16);g=parseInt(s.slice(3,5),16);b=parseInt(s.slice(5,7),16)}else{const m=s.match(/rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);if(m){r=+m[1];g=+m[2];b=+m[3]}}return (.2126*r+.7152*g+.0722*b)/255}
  function center(c){let x=0,y=0;if(c.type==='rect'){x=c.x+c.w*.5;y=c.y+c.h*.5}else{x=c.x||0;y=c.y||0}const m=c.m;if(m)return{x:x*m.a+y*m.c+m.e,y:x*m.b+y*m.d+m.f};return{x,y}}
  function signature(c){if(c.type==='rect')return `r:${Math.round(Math.abs(c.w||0))}:${Math.round(Math.abs(c.h||0))}:${c.style||''}`;if(c.type==='arc')return `a:${Math.round(c.r||0)}:${c.style||''}`;if(c.type==='ellipse')return `e:${Math.round(c.rx||0)}:${Math.round(c.ry||0)}:${c.style||''}`;return c.type+':'+(c.style||'')}
  function push(ctx,cmd){const c=ctx.canvas;if(!c||c.dataset?.pqIgnore!==undefined||c.dataset?.pqGpuOverlay)return;const r=get(c),now=performance.now();if(now-r.lastFrame>10){r.frame++;r.lastFrame=now}cmd.t=now;cmd.frame=r.frame;cmd.alpha=ctx.globalAlpha;cmd.style=typeof ctx.fillStyle==='string'?ctx.fillStyle:null;try{const m=ctx.getTransform();cmd.m={a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f}}catch(_){}cmd.signature=signature(cmd);r.commands.push(cmd);if(r.commands.length>MAX)r.commands.splice(0,r.commands.length-MAX)}
  const P=CanvasRenderingContext2D.prototype;
  function wrap(name,fn){const old=P[name];if(typeof old!=='function'||old.__pqWrapped)return;const w=function(...a){try{fn.call(this,a)}catch(_){}return old.apply(this,a)};w.__pqWrapped=true;P[name]=w}
  wrap('fillRect',function(a){push(this,{type:'rect',x:+a[0],y:+a[1],w:+a[2],h:+a[3]})});
  wrap('strokeRect',function(a){push(this,{type:'rect',x:+a[0],y:+a[1],w:+a[2],h:+a[3],stroke:true})});
  wrap('beginPath',function(){get(this.canvas).path=[]});
  wrap('arc',function(a){get(this.canvas).path?.push({type:'arc',x:+a[0],y:+a[1],r:+a[2]})});
  wrap('ellipse',function(a){get(this.canvas).path?.push({type:'ellipse',x:+a[0],y:+a[1],rx:+a[2],ry:+a[3]})});
  wrap('rect',function(a){get(this.canvas).path?.push({type:'rect',x:+a[0],y:+a[1],w:+a[2],h:+a[3]})});
  wrap('fill',function(){const r=get(this.canvas);if(r.path?.length)for(const q of r.path)push(this,{...q})});
  wrap('drawImage',function(a){const dx=a.length>=9?+a[5]:+a[1],dy=a.length>=9?+a[6]:+a[2],dw=a.length>=9?+a[7]:(a.length>=5?+a[3]:(a[0]?.width||0)),dh=a.length>=9?+a[8]:(a.length>=5?+a[4]:(a[0]?.height||0));push(this,{type:'image',x:dx,y:dy,w:dw,h:dh,style:'#808080'})});
  function recent(canvas,ms=950){const r=store.get(canvas);if(!r)return[];const now=performance.now();return r.commands.filter(c=>now-c.t<=ms)}
  function brightest(canvas){const cs=recent(canvas,2500);let best=null,score=.58;for(const c of cs){const l=colorLum(c.style)*(c.alpha??1);if(l>score){score=l;best=c}}if(!best)return null;return{...center(best),luminance:score,type:best.type}}
  function tracked(canvas){const cs=recent(canvas,1100),seen=new Map(),pairs=[];for(let i=cs.length-1;i>=0;i--){const c=cs[i],sig=c.signature;if(!seen.has(sig)){seen.set(sig,c);continue}const n=seen.get(sig),dt=n.t-c.t;if(dt<8||dt>180)continue;const a=center(c),b=center(n),dx=b.x-a.x,dy=b.y-a.y,mag=Math.hypot(dx,dy);if(mag>.02&&mag<Math.max(canvas.width,canvas.height)*.3){pairs.push({signature:sig,from:a,to:b,dx,dy,dt,mag,command:clone(n)});seen.delete(sig)}if(pairs.length>=96)break}return pairs}
  function motion(canvas){const p=tracked(canvas);if(!p.length)return null;const use=p.sort((a,b)=>b.mag-a.mag).slice(0,12);return{dx:use.reduce((s,v)=>s+v.dx,0)/use.length,dy:use.reduce((s,v)=>s+v.dy,0)/use.length,confidence:Math.min(1,use.length/8),vectors:use}}
  function summary(canvas){const cs=recent(canvas,1000),m=motion(canvas),b=brightest(canvas);let area=0,lum=0;for(const c of cs){if(c.type==='rect'||c.type==='image')area+=Math.abs((c.w||0)*(c.h||0));lum+=colorLum(c.style)}return{version:3,width:canvas.width,height:canvas.height,commands:cs.length,coverage:Math.min(1,area/Math.max(1,canvas.width*canvas.height)),meanCommandLuminance:cs.length?lum/cs.length:0,brightest:b,motion:m?{dx:m.dx,dy:m.dy,confidence:m.confidence}:null}}
  G.WorldProceduralRecorder={version:'3.0.0',recent,tracked,motion,brightest,summary,colorLum,center};
})();