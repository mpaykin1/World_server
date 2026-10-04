'use strict';

function eventPosition(event){return event.at||event.center||event.position||event.to||event.origin||null;}

function renderCommandsForEvents(events,{maxCommands=2000}={}) {
  const commands=[],push=command=>{if(commands.length<maxCommands)commands.push(command);};
  for(const event of events||[]){
    const position=eventPosition(event);
    if(event.type==='reaction'&&event.reaction==='lava-water'){
      push({type:'particle-emitter',effect:'steam-burst',position:event.neighbor||position,intensity:1});
      push({type:'light-pulse',effect:'thermal-flash',position,intensity:.7,duration:.18});continue;
    }
    if(event.type==='phase-change'){
      push({type:'particle-emitter',effect:event.to==='steam'?'steam':'condensation',position,intensity:.45});continue;
    }
    if(event.type==='ignition'){
      push({type:'particle-emitter',effect:'fire-sparks',position,intensity:.8});
      push({type:'light-emitter',effect:'fire',action:'start',position,intensity:.8});continue;
    }
    if(event.type==='burnout'||event.type==='extinguished'){
      push({type:'particle-emitter',effect:event.type==='burnout'?'ash':'steam-puff',position,intensity:.6});
      push({type:'light-emitter',effect:'fire',action:'fade',position,intensity:.35});continue;
    }
    if(event.type==='cell-fracture'){
      push({type:'particle-emitter',effect:'debris',position,material:event.material,
        intensity:Math.max(.25,Math.min(2,Number(event.impulse||1)/5))});continue;
    }
    if(event.type==='cluster-detached'){
      push({type:'physics-visual',effect:'cluster-detached',clusterId:event.clusterId,
        position:event.center,cellCount:event.cellCount});continue;
    }
    if(event.type==='cluster-impact'){
      push({type:'particle-emitter',effect:event.result==='shattered'?'debris-burst':'dust-impact',
        position,intensity:Math.max(.3,Math.min(2.5,Number(event.speed||0)/4))});
      push({type:'camera-impulse',effect:'impact',strength:Math.max(.05,Math.min(1.5,Number(event.speed||0)/12))});continue;
    }
    if(event.type==='explosion'){
      push({type:'particle-emitter',effect:'explosion',position:event.center,
        intensity:Math.max(.5,Math.min(3,Number(event.force||0)/5))});
      push({type:'light-pulse',effect:'explosion',position:event.center,
        intensity:Math.max(.8,Math.min(4,Number(event.force||0)/3)),duration:.22});
      push({type:'camera-impulse',effect:'explosion',strength:Math.max(.1,Math.min(2,Number(event.force||0)/10))});
    }
  }
  return commands;
}
module.exports={renderCommandsForEvents,eventPosition};
