export class FixedStepPendulum{
  constructor({length=5,gravity=9.81,damping=.42,angle=.24,angularVelocity=0,fixedDt=1/120}={}){Object.assign(this,{length,gravity,damping,angle,angularVelocity,fixedDt});this.acc=0;}
  kick(v=.35){this.angularVelocity+=v;}
  step(dt){this.acc=Math.min(.25,this.acc+Math.max(0,Math.min(dt,.05)));while(this.acc>=this.fixedDt){const a=-(this.gravity/this.length)*Math.sin(this.angle)-this.damping*this.angularVelocity;this.angularVelocity+=a*this.fixedDt;this.angle+=this.angularVelocity*this.fixedDt;this.acc-=this.fixedDt;}return this.state();}
  state(){return{angle:this.angle,angularVelocity:this.angularVelocity,x:Math.sin(this.angle)*this.length,y:-Math.cos(this.angle)*this.length};}
}
