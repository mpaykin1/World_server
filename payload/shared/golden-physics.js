'use strict';
(function(){
  if(window.GameGoldenPhysics) return;
  const DEFAULT_STEP_HEIGHTS=Object.freeze([.25,.5,.75,1,1.05]);

  function stepAxis(position,axis,delta,canOccupy,allowStep=true,stepHeights=DEFAULT_STEP_HEIGHTS){
    const start={x:Number(position.x),y:Number(position.y),z:Number(position.z)};
    if(!Number.isFinite(delta)||delta===0) return {moved:false,blocked:false,stepped:false,position:start};
    const target={...start,[axis]:start[axis]+delta};
    if(canOccupy(target)) return {moved:true,blocked:false,stepped:false,position:target};
    if(allowStep){
      for(const h of stepHeights){
        const raised={x:start.x,y:start.y+h,z:start.z};
        if(!canOccupy(raised)) continue;
        const stepped={...raised,[axis]:raised[axis]+delta};
        if(!canOccupy(stepped)) continue;
        return {moved:true,blocked:false,stepped:true,stepHeight:h,position:stepped};
      }
    }
    return {moved:false,blocked:true,stepped:false,position:start};
  }

  function moveSwept(position,delta,canOccupy,options={}){
    const maxStep=Math.max(.02,Number(options.maxSubstep)||.2);
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(delta.x||0),Math.abs(delta.y||0),Math.abs(delta.z||0))/maxStep));
    let pos={x:Number(position.x),y:Number(position.y),z:Number(position.z)},blocked=false,stepped=false;
    for(let i=0;i<steps;i++){
      const dx=(delta.x||0)/steps,dz=(delta.z||0)/steps;
      if(dx){
        const r=stepAxis(pos,'x',dx,canOccupy,options.allowStep!==false,options.stepHeights||DEFAULT_STEP_HEIGHTS);
        pos=r.position;blocked=blocked||r.blocked;stepped=stepped||r.stepped;
      }
      if(dz){
        const r=stepAxis(pos,'z',dz,canOccupy,options.allowStep!==false,options.stepHeights||DEFAULT_STEP_HEIGHTS);
        pos=r.position;blocked=blocked||r.blocked;stepped=stepped||r.stepped;
      }
      if(delta.y){
        const target={...pos,y:pos.y+(delta.y/steps)};
        if(canOccupy(target))pos=target;else blocked=true;
      }
    }
    return {position:pos,blocked,stepped,substeps:steps};
  }

  function canonicalXZ(yaw,forwardInput,sideInput,speed=1){
    const sy=Math.sin(yaw),cy=Math.cos(yaw);
    const forward={x:-sy,z:-cy};
    const basis=window.GameGoldenStandard?.basisFromForward
      ? window.GameGoldenStandard.basisFromForward(forward.x,forward.z)
      : {forward,right:{x:-forward.z,z:forward.x}};
    return {
      x:(forwardInput*basis.forward.x+sideInput*basis.right.x)*speed,
      z:(forwardInput*basis.forward.z+sideInput*basis.right.z)*speed
    };
  }

  window.GameGoldenPhysics={DEFAULT_STEP_HEIGHTS,stepAxis,moveSwept,canonicalXZ};
})();