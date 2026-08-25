(() => {
  'use strict';
  const G = globalThis;
  if (G.WorldProceduralAnimation) return;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const hash=(s)=>{let h=2166136261>>>0;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
  const phase=(id,salt)=>((hash(id+':'+salt)>>>0)/4294967295)*Math.PI*2;
  function naturalNoise(id,t,speed=1){
    return Math.sin(t*speed*.61+phase(id,1))*.47+Math.sin(t*speed*1.17+phase(id,2))*.28+Math.sin(t*speed*2.03+phase(id,3))*.16+Math.sin(t*speed*3.71+phase(id,4))*.09;
  }
  function criticallyDamped(current,target,velocity,halflife,dt){
    const y=Math.log(2)/Math.max(.0001,halflife); const j0=current-target; const j1=velocity+j0*y; const e=Math.exp(-y*dt);
    return {value:e*(j0+j1*dt)+target, velocity:e*(velocity-j1*y*dt)};
  }
  function createSpring(value=0,halflife=.12){
    let x=value,v=0; return {step(target,dt){const r=criticallyDamped(x,target,v,halflife,dt);x=r.value;v=r.velocity;return x},get value(){return x},reset(n=value){x=n;v=0}};
  }
  function solveFABRIK(points,lengths,target,iterations=8,tolerance=.001){
    const p=points.map(q=>({x:q.x,y:q.y})); if(p.length<2||lengths.length!==p.length-1) return p;
    const root={...p[0]}, total=lengths.reduce((a,b)=>a+b,0); const dist=Math.hypot(target.x-root.x,target.y-root.y);
    if(dist>=total){const ang=Math.atan2(target.y-root.y,target.x-root.x);for(let i=1;i<p.length;i++)p[i]={x:p[i-1].x+Math.cos(ang)*lengths[i-1],y:p[i-1].y+Math.sin(ang)*lengths[i-1]};return p}
    for(let k=0;k<iterations;k++){
      p[p.length-1]={...target};
      for(let i=p.length-2;i>=0;i--){const dx=p[i].x-p[i+1].x,dy=p[i].y-p[i+1].y,d=Math.max(.00001,Math.hypot(dx,dy)),r=lengths[i]/d;p[i]={x:p[i+1].x+dx*r,y:p[i+1].y+dy*r}}
      p[0]={...root};
      for(let i=1;i<p.length;i++){const dx=p[i].x-p[i-1].x,dy=p[i].y-p[i-1].y,d=Math.max(.00001,Math.hypot(dx,dy)),r=lengths[i-1]/d;p[i]={x:p[i-1].x+dx*r,y:p[i-1].y+dy*r}}
      if(Math.hypot(p[p.length-1].x-target.x,p[p.length-1].y-target.y)<tolerance)break;
    } return p;
  }
  function solveCCD(points,target,iterations=10){
    const p=points.map(q=>({x:q.x,y:q.y}));
    for(let k=0;k<iterations;k++) for(let i=p.length-2;i>=0;i--){
      const end=p[p.length-1], joint=p[i]; const a=Math.atan2(end.y-joint.y,end.x-joint.x), b=Math.atan2(target.y-joint.y,target.x-joint.x), d=b-a, cs=Math.cos(d),sn=Math.sin(d);
      for(let j=i+1;j<p.length;j++){const x=p[j].x-joint.x,y=p[j].y-joint.y;p[j].x=joint.x+x*cs-y*sn;p[j].y=joint.y+x*sn+y*cs}
    } return p;
  }
  function createVerletChain(count=6,spacing=8){
    const pts=Array.from({length:count},(_,i)=>({x:0,y:i*spacing,px:0,py:i*spacing}));
    return {points:pts,step(anchor,dt,{gravity=60,damping=.985,iterations=5}={}){
      pts[0].x=anchor.x;pts[0].y=anchor.y;pts[0].px=anchor.x;pts[0].py=anchor.y;
      const d2=dt*dt;for(let i=1;i<pts.length;i++){const q=pts[i],vx=(q.x-q.px)*damping,vy=(q.y-q.py)*damping;q.px=q.x;q.py=q.y;q.x+=vx;q.y+=vy+gravity*d2}
      for(let k=0;k<iterations;k++){pts[0].x=anchor.x;pts[0].y=anchor.y;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,dist=Math.max(.001,Math.hypot(dx,dy)),err=(dist-spacing)/dist;if(i===1){b.x-=dx*err;b.y-=dy*err}else{a.x+=dx*err*.5;a.y+=dy*err*.5;b.x-=dx*err*.5;b.y-=dy*err*.5}}}
      return pts;
    }};
  }
  function humanIdle(id,t,amount=1){
    const breath=naturalNoise(id+':breath',t,.62)*.46*amount;
    const weight=naturalNoise(id+':weight',t,.21)*.36*amount;
    const gazeX=naturalNoise(id+':gazeX',t,.11)*.42*amount;
    const gazeY=naturalNoise(id+':gazeY',t,.09)*.25*amount;
    const hands=naturalNoise(id+':hands',t,.39)*.31*amount;
    const blinkCarrier=naturalNoise(id+':blink',t,.17)+naturalNoise(id+':blink2',t,.071)*.35;
    return {y:breath,rotation:weight*.012,shoulder:breath*.5,hand:hands,gazeX,gazeY,blink:blinkCarrier>1.03};
  }
  function constrainAngle(a,min,max){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return clamp(a,min,max)}
  function solveConstrainedChain(points,lengths,target,limits=[],iterations=8){let p=solveFABRIK(points,lengths,target,iterations);for(let k=0;k<2;k++){for(let i=1;i<p.length-1;i++){const a0=Math.atan2(p[i].y-p[i-1].y,p[i].x-p[i-1].x),a1=Math.atan2(p[i+1].y-p[i].y,p[i+1].x-p[i].x),lim=limits[i-1]||[-Math.PI,Math.PI],rel=constrainAngle(a1-a0,lim[0],lim[1]),ang=a0+rel;p[i+1]={x:p[i].x+Math.cos(ang)*lengths[i],y:p[i].y+Math.sin(ang)*lengths[i]}}}return p}
  G.WorldProceduralAnimation={version:'3.0.0',naturalNoise,createSpring,solveFABRIK,solveCCD,solveConstrainedChain,createVerletChain,humanIdle,clamp,lerp};
})();
