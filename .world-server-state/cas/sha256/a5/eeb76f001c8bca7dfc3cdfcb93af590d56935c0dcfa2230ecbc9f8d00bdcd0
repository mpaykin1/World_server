(() => {
'use strict';const G=globalThis;if(G.WorldProceduralThermalGovernor?.version==='10.0.0')return;
async function create(){
 let battery=null;try{battery=await navigator.getBattery?.()}catch(_){}
 let state={tier:1,reason:'normal',battery:battery?.level??null,charging:battery?.charging??null,hidden:document.hidden,saveData:navigator.connection?.saveData||false,longTaskPressure:0};
 function evaluate({p95FrameMs=16.7,longTaskP95=0}={}){
  state.battery=battery?.level??state.battery;state.charging=battery?.charging??state.charging;state.hidden=document.hidden;state.longTaskPressure=longTaskP95;
  let tier=1,reason='normal';
  if(state.hidden){tier=.35;reason='hidden'}
  else if(state.saveData){tier=.65;reason='save-data'}
  else if(state.battery!=null&&state.battery<.18&&!state.charging){tier=.58;reason='low-battery'}
  else if(p95FrameMs>33||longTaskP95>90){tier=.62;reason='thermal-or-main-thread-pressure'}
  else if(p95FrameMs>24||longTaskP95>55){tier=.8;reason='moderate-pressure'}
  state.tier=tier;state.reason=reason;return{...state}
 }
 return{evaluate,status:()=>({...state})}
}
G.WorldProceduralThermalGovernor={version:'10.0.0',create};
})();