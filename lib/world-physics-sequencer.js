'use strict';

class WorldPhysicsSequencer {
  constructor(runtime, actions = []) {
    if (!runtime) throw new Error('WorldPhysicsSequencer requires a WorldPhysicsRuntime');
    this.runtime = runtime;
    this.actions = actions.map((action,index)=>({
      ...action,at:Math.max(0,Math.floor(Number(action.at)||0)),_index:index
    })).sort((a,b)=>a.at-b.at||a._index-b._index);
    this.cursor=0;this.tick=0;this.events=[];
  }
  reset(){this.cursor=0;this.tick=0;this.events=[];}
  step(runtimeOptions={}) {
    const executed=[];
    while(this.cursor<this.actions.length&&this.actions[this.cursor].at<=this.tick){
      const action=this.actions[this.cursor++];executed.push({action,result:this._execute(action)});
    }
    const physics=this.runtime.step(runtimeOptions),sequenceEvents=this.events;
    this.events=[];const out={tick:this.tick,executed,physics,sequenceEvents};this.tick++;return out;
  }
  run(ticks,runtimeOptions={}) {
    const results=[];for(let i=0;i<Math.max(0,Math.floor(ticks));i++)results.push(this.step(runtimeOptions));return results;
  }
  _execute(action) {
    const p=action.position||{};
    switch(action.type){
      case'set':return this.runtime.setCell(p.x,p.y,p.z||0,action.material,action.state||{});
      case'clear':this.runtime.clearCell(p.x,p.y,p.z||0);return true;
      case'fill':return this._fill(action);
      case'anchor':this.runtime.addAnchor(p.x,p.y,p.z||0);return true;
      case'remove-anchor':this.runtime.removeAnchor(p.x,p.y,p.z||0);return true;
      case'ignite':{
        const cell=this.runtime.getCell(p.x,p.y,p.z||0);if(!cell)return false;
        cell.burning=true;cell.temperature=Math.max(Number(cell.temperature||20),Number(action.temperature||500));
        this.runtime.setCell(p.x,p.y,p.z||0,cell.material,cell);return true;
      }
      case'explode':return this.runtime.explode({...p,...(action.options||{})});
      case'impulse':return this.runtime.clusters.applyImpulse(action.clusterId,action.impulse||{},action.angular||{});
      case'transition':case'camera':case'marker':{
        const event={tick:this.tick,type:`sequence-${action.type}`,name:action.name||null,
          position:action.position||null,payload:action.payload||null};
        this.events.push(event);return event;
      }
      default:throw new Error(`Unsupported physics sequence action: ${action.type}`);
    }
  }
  _fill(action) {
    const min=action.min||{},max=action.max||min;
    if(![min.x,min.y,max.x,max.y].every(Number.isFinite))throw new Error('fill requires finite min/max x/y');
    const zMin=this.runtime.mode==='pixel2d'?0:Number(min.z||0);
    const zMax=this.runtime.mode==='pixel2d'?0:Number(max.z??zMin);
    let placed=0;
    for(let y=min.y;y<=max.y;y++)for(let x=min.x;x<=max.x;x++)for(let z=zMin;z<=zMax;z++){
      this.runtime.setCell(x,y,z,action.material,action.state||{});placed++;
    }
    return{placed};
  }
}
module.exports={WorldPhysicsSequencer};
