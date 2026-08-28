'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.GameMotionEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='2.0.0';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const invLerp=(a,b,v)=>a===b?0:clamp((v-a)/(b-a));
  const EASING={
    linear:t=>clamp(t),
    smoothstep:t=>{t=clamp(t);return t*t*(3-2*t)},
    smootherstep:t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10)},
    easeInQuad:t=>{t=clamp(t);return t*t},
    easeOutQuad:t=>{t=clamp(t);return 1-(1-t)*(1-t)},
    easeInOutCubic:t=>{t=clamp(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2},
    easeOutBack:t=>{t=clamp(t);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)}
  };
  function progressToFrame(progress,count){
    count=Math.max(1,Number(count)||1);
    return Math.min(count-1,Math.max(0,Math.round(clamp(progress)*(count-1))));
  }
  function hash32(seed){
    let x=Number(seed)||0; x=(x+0x6D2B79F5)|0; x=Math.imul(x^(x>>>15),x|1);
    x^=x+Math.imul(x^(x>>>7),x|61); return ((x^(x>>>14))>>>0);
  }
  class DeterministicRng{
    constructor(seed=1){this.seed=hash32(seed)||1}
    next(){this.seed=hash32(this.seed);return this.seed/4294967296}
    signed(){return this.next()*2-1}
  }
  class Spring {
    constructor({value=0,velocity=0,stiffness=170,damping=26,mass=1,maxSpeed=Infinity}={}){
      this.value=Number(value)||0;this.velocity=Number(velocity)||0;this.target=this.value;
      this.stiffness=stiffness;this.damping=damping;this.mass=mass;this.maxSpeed=maxSpeed;
    }
    setTarget(v){this.target=Number(v)||0;return this}
    snap(v){this.value=this.target=Number(v)||0;this.velocity=0;return this}
    step(dt){
      dt=Math.min(.05,Math.max(0,Number(dt)||0));
      const force=-this.stiffness*(this.value-this.target)-this.damping*this.velocity;
      const a=force/Math.max(.0001,this.mass);
      this.velocity+=a*dt;this.velocity=Math.max(-this.maxSpeed,Math.min(this.maxSpeed,this.velocity));
      this.value+=this.velocity*dt;return this.value;
    }
  }
  class Timeline {
    constructor({duration=1,loop=false,easing='linear'}={}){
      this.duration=Math.max(.0001,Number(duration)||1);this.loop=!!loop;this.easing=easing;
      this.time=0;this.progress=0;this.tracks=[];this.running=false;this.playbackRate=1;
    }
    addTrack({from=0,to=1,set,easing}={}){
      if(typeof set!=='function')throw new Error('Timeline track requires set(value, progress)');
      this.tracks.push({from:Number(from)||0,to:Number(to)||0,set,easing});return this;
    }
    seek(progress){
      const raw=clamp(progress),globalEase=EASING[this.easing]||EASING.linear;this.progress=raw;
      for(const tr of this.tracks){const fn=EASING[tr.easing]||globalEase,p=fn(raw);tr.set(lerp(tr.from,tr.to,p),p)}
      return this;
    }
    step(dt){
      if(!this.running)return this.progress;
      this.time+=Math.max(0,Number(dt)||0)*this.playbackRate;let p=this.time/this.duration;
      if(this.loop)p=p-Math.floor(p);else if(p>=1){p=1;this.running=false}
      this.seek(p);return this.progress;
    }
    play({restart=false}={}){if(restart){this.time=0;this.seek(0)}this.running=true;return this}
    pause(){this.running=false;return this}
  }
  class EventEnvelope{
    constructor({attack=.08,hold=.03,release=.22}={}){
      this.attack=Math.max(.001,attack);this.hold=Math.max(0,hold);this.release=Math.max(.001,release);
      this.time=Infinity;this.value=0;
    }
    trigger(){this.time=0;this.value=0;return this}
    step(dt){
      this.time+=Math.max(0,Number(dt)||0);
      if(this.time<this.attack)this.value=this.time/this.attack;
      else if(this.time<this.attack+this.hold)this.value=1;
      else if(this.time<this.attack+this.hold+this.release)this.value=1-(this.time-this.attack-this.hold)/this.release;
      else this.value=0;
      return clamp(this.value);
    }
  }
  class LocomotionClock{
    constructor({strideLength=1,minSpeed=.01}={}){
      this.strideLength=Math.max(.05,Number(strideLength)||1);this.minSpeed=minSpeed;this.phase=0;this.distance=0;
    }
    reset(phase=0){this.phase=((phase%1)+1)%1;this.distance=0;return this}
    stepDistance(distance){
      const d=Math.max(0,Number(distance)||0);this.distance+=d;
      this.phase=(this.phase+d/this.strideLength)%1;return this.phase;
    }
    stepSpeed(speed,dt){return this.stepDistance(Math.max(0,Number(speed)||0)*Math.max(0,Number(dt)||0))}
    footPhase(side='left'){return side==='right'?(this.phase+.5)%1:this.phase}
    contact(side='left',threshold=.13){const p=this.footPhase(side);return p<threshold||p>1-threshold}
  }
  class MotionGraph{
    constructor({initial='idle',context={}}={}){
      this.state=initial;this.context=context;this.states=new Map();this.transitions=[];this.timeInState=0;
    }
    addState(name,{enter,exit,update}={}){this.states.set(String(name),{enter,exit,update});return this}
    addTransition(from,to,when,{priority=0}={}){
      if(typeof when!=='function')throw new Error('Transition requires when(context, graph)');
      this.transitions.push({from:String(from),to:String(to),when,priority});
      this.transitions.sort((a,b)=>b.priority-a.priority);return this;
    }
    setState(next){
      next=String(next);if(next===this.state)return false;
      this.states.get(this.state)?.exit?.(this.context,this);
      this.state=next;this.timeInState=0;this.states.get(this.state)?.enter?.(this.context,this);return true;
    }
    step(dt){
      dt=Math.max(0,Number(dt)||0);this.timeInState+=dt;
      for(const tr of this.transitions)if((tr.from==='*'||tr.from===this.state)&&tr.when(this.context,this)){this.setState(tr.to);break}
      this.states.get(this.state)?.update?.(dt,this.context,this);return this.state;
    }
  }
  class TraumaShake{
    constructor({decay=1.7,maxRotation=.035,maxTranslation=.08,seed=1}={}){
      this.trauma=0;this.decay=decay;this.maxRotation=maxRotation;this.maxTranslation=maxTranslation;this.rng=new DeterministicRng(seed);this.t=0;
    }
    add(amount){this.trauma=clamp(this.trauma+Math.max(0,amount));return this}
    step(dt){
      dt=Math.max(0,Number(dt)||0);this.t+=dt;this.trauma=Math.max(0,this.trauma-this.decay*dt);
      const a=this.trauma*this.trauma;
      const n1=Math.sin(this.t*31.7+this.rng.seed*.00001),n2=Math.sin(this.t*23.9+1.7),n3=Math.sin(this.t*37.1+3.2);
      return {x:n1*this.maxTranslation*a,y:n2*this.maxTranslation*a,rotation:n3*this.maxRotation*a,amplitude:a};
    }
  }
  class FrameSequence {
    constructor({frames=[],canvas=null,imageFactory=null,preloadRadius=4,frameCount=0,maxCachedFrames=48}={}){
      this.frames=Array.isArray(frames)?frames.slice():[];this.frameCount=Math.max(frameCount||this.frames.length,1);
      this.canvas=canvas||null;this.ctx=canvas?.getContext?.('2d')||null;
      this.imageFactory=imageFactory||(()=>typeof Image!=='undefined'?new Image():null);
      this.preloadRadius=Math.max(0,preloadRadius|0);this.maxCachedFrames=Math.max(8,maxCachedFrames|0);
      this.cache=new Map();this.lastFrame=-1;this.animationHz=60;this.lastDraw=0;this.quality=1;
    }
    setAnimationHz(v){this.animationHz=Math.max(1,Number(v)||60)}
    setSecondaryMotionBudget(v){this.quality=clamp(v);this.preloadRadius=Math.max(1,Math.round(1+this.quality*5))}
    setIkBudget(){}
    _source(i){return this.frames[i]??this.frames[this.frames.length-1]??null}
    _touch(i){const e=this.cache.get(i);if(e)e.t=Date.now()}
    _evict(){
      if(this.cache.size<=this.maxCachedFrames)return;
      const ordered=[...this.cache.entries()].sort((a,b)=>(a[1].t||0)-(b[1].t||0));
      while(this.cache.size>this.maxCachedFrames&&ordered.length){const [i]=ordered.shift();this.cache.delete(i)}
    }
    preloadAround(index){
      for(let d=-this.preloadRadius;d<=this.preloadRadius;d++){
        const i=Math.max(0,Math.min(this.frameCount-1,index+d));
        if(this.cache.has(i)){this._touch(i);continue}
        const src=this._source(i),img=this.imageFactory();if(!src||!img)continue;
        const entry={img,t:Date.now(),ready:false};this.cache.set(i,entry);
        img.decoding='async';img.onload=()=>{entry.ready=true};img.onerror=()=>{entry.error=true};img.src=src;
      }this._evict();
    }
    nearestReady(index){
      const exact=this.cache.get(index);if(exact?.ready||exact?.img?.complete)return exact.img;
      for(let d=1;d<=this.preloadRadius+2;d++)for(const i of [index-d,index+d]){
        const e=this.cache.get(i);if(i>=0&&i<this.frameCount&&(e?.ready||e?.img?.complete))return e.img;
      }return null;
    }
    drawProgress(progress,now=typeof performance!=='undefined'?performance.now():Date.now()){
      const minInterval=1000/this.animationHz;if(now-this.lastDraw<minInterval)return this.lastFrame;this.lastDraw=now;
      const i=progressToFrame(progress,this.frameCount);this.preloadAround(i);const img=this.nearestReady(i);
      if(this.ctx&&img){const w=this.canvas.width,h=this.canvas.height;this.ctx.clearRect(0,0,w,h);this.ctx.drawImage(img,0,0,w,h)}
      this.lastFrame=i;return i;
    }
    clear(){this.cache.clear();this.lastFrame=-1}
  }
  class MotionBus {
    constructor(){this.channels=new Map();this.listeners=new Map();this.animationHz=60;this.secondaryBudget=1;this.ikBudget=1}
    set(name,value){
      const k=String(name),v=clamp(value),old=this.channels.get(k);this.channels.set(k,v);
      if(old!==v)for(const fn of this.listeners.get(k)||[])try{fn(v,old)}catch{}
      return this;
    }
    get(name,fallback=0){return this.channels.has(String(name))?this.channels.get(String(name)):fallback}
    bind(name,callback){
      const k=String(name);if(typeof callback!=='function')return()=>{};
      if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(callback);
      return()=>this.listeners.get(k)?.delete(callback);
    }
    setAnimationHz(v){this.animationHz=Math.max(1,Number(v)||60)}
    setSecondaryMotionBudget(v){this.secondaryBudget=clamp(v)}
    setIkBudget(v){this.ikBudget=clamp(v)}
  }
  class MotionScheduler{
    constructor({hz=60,now=()=>typeof performance!=='undefined'?performance.now():Date.now()}={}){
      this.hz=hz;this.now=now;this.items=new Set();this.running=false;this._raf=0;this._last=0;this.quality=1;
    }
    add(item){if(item&&typeof item.update==='function')this.items.add(item);return()=>this.items.delete(item)}
    setAnimationHz(v){this.hz=Math.max(1,Number(v)||60)}
    setSecondaryMotionBudget(v){this.quality=clamp(v)}
    setIkBudget(){}
    step(now=this.now()){
      if(!this._last)this._last=now;const min=1000/this.hz;if(now-this._last<min)return 0;
      const dt=Math.min(.1,(now-this._last)/1000);this._last=now;let n=0;
      for(const item of this.items){
        if(item.enabled===false)continue;
        if(typeof item.visible==='function'&&!item.visible())continue;
        try{item.update(dt,now/1000,this.quality);n++}catch{}
      }return n;
    }
    start(){
      if(this.running||typeof requestAnimationFrame==='undefined')return this;this.running=true;
      const tick=n=>{if(!this.running)return;this.step(n);this._raf=requestAnimationFrame(tick)};
      this._raf=requestAnimationFrame(tick);return this;
    }
    stop(){this.running=false;if(this._raf&&typeof cancelAnimationFrame!=='undefined')cancelAnimationFrame(this._raf);this._raf=0;return this}
  }
  function createExplodedController(parts,{distance=1,easing='smoothstep'}={}){
    const prepared=(parts||[]).map((p,idx)=>{
      const pos=p?.position||{x:0,y:0,z:0},base={x:Number(pos.x)||0,y:Number(pos.y)||0,z:Number(pos.z)||0};
      const mag=Math.hypot(base.x,base.y,base.z)||1;
      const dir=p?.userData?.explodeDirection||{x:base.x/mag||((idx%3)-1),y:base.y/mag||.25,z:base.z/mag||(((idx+1)%3)-1)};
      return {p,base,dir};
    });
    return {progress:0,setProgress(v){
      this.progress=clamp(v);const t=(EASING[easing]||EASING.smoothstep)(this.progress)*distance;
      for(const x of prepared){if(!x.p?.position)continue;x.p.position.x=x.base.x+x.dir.x*t;x.p.position.y=x.base.y+x.dir.y*t;x.p.position.z=x.base.z+x.dir.z*t}
      return this.progress;},restore(){return this.setProgress(0)}};
  }
  function attachQualityAutopilot(adapter){
    try{const api=globalThis?.WorldQualityAutopilot;if(api?.registerAnimationAdapter)return api.registerAnimationAdapter(adapter)}catch{}
    return()=>{};
  }
  function signalFromVelocity(speed,{walk=1,run=4}={}){
    speed=Math.max(0,Number(speed)||0);return clamp((speed-walk)/(Math.max(run,walk+.001)-walk));
  }
  return {
    VERSION,clamp,lerp,invLerp,EASING,progressToFrame,DeterministicRng,Spring,Timeline,EventEnvelope,
    LocomotionClock,MotionGraph,TraumaShake,FrameSequence,MotionBus,MotionScheduler,
    createExplodedController,attachQualityAutopilot,signalFromVelocity
  };
});
