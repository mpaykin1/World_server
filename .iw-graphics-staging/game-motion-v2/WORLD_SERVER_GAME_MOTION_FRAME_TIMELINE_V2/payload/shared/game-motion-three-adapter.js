'use strict';
(function(root){
  const G=root.GameMotionEngine;if(!G)return;
  const scheduler=new G.MotionScheduler({hz:60});let quality=1;
  const roots=new WeakMap();
  function vec(v){return{x:Number(v?.x)||0,y:Number(v?.y)||0,z:Number(v?.z)||0}}
  function attach(object,config={}){
    if(!object)return null;
    const type=String(config.type||'sway').toLowerCase(),basePos=vec(object.position),baseRot=vec(object.rotation);
    const baseScale=vec(object.scale||{x:1,y:1,z:1});const phase=Number(config.phase)||Math.random()*Math.PI*2;
    const speed=Math.max(.01,Number(config.speed)||1),amount=Number(config.amount??.04);
    const c={object,type,basePos,baseRot,baseScale,phase,speed,amount,enabled:true,
      visible:()=>object.visible!==false,
      update(dt,t,q){
        if(!this.enabled)return;const a=this.amount*q,s=Math.sin(t*this.speed+this.phase);
        if(this.type==='sway'&&object.rotation){object.rotation.z=this.baseRot.z+s*a;object.rotation.x=this.baseRot.x+Math.sin(t*this.speed*.63+this.phase)*a*.35}
        else if(this.type==='bob'&&object.position)object.position.y=this.basePos.y+s*a;
        else if(this.type==='spin'&&object.rotation)object.rotation.y=this.baseRot.y+t*this.speed*this.amount;
        else if(this.type==='pulse'&&object.scale){const k=1+s*a;object.scale.set?.(this.baseScale.x*k,this.baseScale.y*k,this.baseScale.z*k)}
        else if(this.type==='breathe'&&object.scale){const k=1+s*a*.35;object.scale.set?.(this.baseScale.x*k,this.baseScale.y*k,this.baseScale.z*k)}
      },
      dispose(){this._off?.();roots.delete(object)}
    };
    c._off=scheduler.add(c);roots.set(object,c);scheduler.start();return c;
  }
  function autoFromScene(scene){
    const out=[];scene?.traverse?.(obj=>{const cfg=obj?.userData?.motion;if(cfg&&cfg.type&&!roots.has(obj))out.push(attach(obj,cfg))});return out;
  }
  function makeDistanceVisibility(object,camera,maxDistance=60){
    return()=>{if(!object?.getWorldPosition||!camera?.getWorldPosition)return true;
      const a=object.getWorldPosition({x:0,y:0,z:0}),b=camera.getWorldPosition({x:0,y:0,z:0});
      const d=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);return d<=maxDistance;
    };
  }
  const qualityAdapter={
    setAnimationHz:v=>scheduler.setAnimationHz(v),
    setSecondaryMotionBudget(v){quality=G.clamp(v);scheduler.setSecondaryMotionBudget(v)},
    setIkBudget(){}
  };
  G.attachQualityAutopilot(qualityAdapter);
  root.GameMotionThree={attach,autoFromScene,makeDistanceVisibility,step:n=>scheduler.step(n),scheduler,qualityAdapter};
})(typeof globalThis!=='undefined'?globalThis:this);
