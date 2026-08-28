import { FixedStepPendulum } from './pendulum-physics.mjs';
export class RopePhysicsRuntime{
  constructor({length=5}={}){this.length=length;this.mode='fallback';this.fallback=new FixedStepPendulum({length});this.ready=false;this.acc=0;this.fixedDt=1/60;}
  async init(){
    try{
      const mod=await import('/shared/vendor/rapier/rapier.bundle.mjs'); const R=mod.default||mod.RAPIER||mod;
      if(typeof R.init==='function')await R.init();
      this.R=R;this.world=new R.World({x:0,y:-9.81,z:0});
      this.anchor=this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,0,0));
      this.body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(.7,-this.length,0).setLinearDamping(.7).setAngularDamping(.8).setCcdEnabled(true));
      this.world.createCollider(R.ColliderDesc.cuboid(.35,.85,.25).setDensity(1.0),this.body);
      const joint=R.JointData.rope(this.length,{x:0,y:0,z:0},{x:0,y:.85,z:0});this.world.createImpulseJoint(joint,this.anchor,this.body,true);
      this.body.applyImpulse({x:.8,y:0,z:.18},true);this.mode='rapier';this.ready=true;
    }catch(error){console.warn('[RopePhysics] Rapier fallback:',error);this.mode='fallback';this.ready=true;}
    return this.mode;
  }
  step(dt){
    if(this.mode!=='rapier'){const s=this.fallback.step(dt);return{x:s.x,y:s.y,z:Math.sin(s.angle*.7)*.35,rotationZ:-s.angle*.32,velocity:Math.abs(s.angularVelocity),mode:this.mode};}
    this.acc=Math.min(.25,this.acc+Math.max(0,Math.min(dt,.05)));while(this.acc>=this.fixedDt){this.world.timestep=this.fixedDt;this.world.step();this.acc-=this.fixedDt;}const p=this.body.translation(),v=this.body.linvel();return{x:p.x,y:p.y,z:p.z,rotationZ:Math.atan2(p.x,-p.y)*-.25,velocity:Math.hypot(v.x,v.y,v.z),mode:this.mode};
  }
}
