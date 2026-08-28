'use strict';
(function(){
 if(window.CinematicTemporalQualityGovernor)return;
 const adapters=new Set(),samples=[];let state={scale:1,atmosphere:1,shadows:1,secondary:1,farDetail:1,heroDetail:1,lastChange:0};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function percentile(a,p){if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y);return b[Math.floor((b.length-1)*p)]}
 function apply(reason){for(const a of adapters)try{a.applyTemporalQuality?.({...state,reason})}catch{};dispatchEvent(new CustomEvent('cinematictemporalquality',{detail:{...state,reason}}))}
 function sample(d){
   const fps=Number(d?.fps||0),p95=Number(d?.frameP95Ms||0),now=performance.now();if(!fps)return;
   samples.push({fps,p95,t:now});while(samples.length>24)samples.shift();if(samples.length<4||now-state.lastChange<2500)return;
   const med=percentile(samples.map(x=>x.fps),.5),badP95=percentile(samples.map(x=>x.p95||0),.9);
   if(med<34||badP95>32){
     // preserve hero/near identity; reduce distant/effect cost first
     state.farDetail=clamp(state.farDetail-.10,.35,1);state.secondary=clamp(state.secondary-.10,.30,1);state.shadows=clamp(state.shadows-.08,.45,1);state.atmosphere=clamp(state.atmosphere-.06,.50,1);
     if(state.farDetail<=.45)state.scale=clamp(state.scale-.05,.68,1);state.heroDetail=Math.max(state.heroDetail,.78);state.lastChange=now;apply('pressure');
   }else if(med>57&&badP95<20){
     state.scale=clamp(state.scale+.025,.68,1);state.atmosphere=clamp(state.atmosphere+.04,.50,1);state.shadows=clamp(state.shadows+.04,.45,1);state.secondary=clamp(state.secondary+.05,.30,1);state.farDetail=clamp(state.farDetail+.05,.35,1);state.heroDetail=clamp(state.heroDetail+.04,.78,1.20);state.lastChange=now;apply('headroom');
   }
 }
 function register(a){if(!a)return()=>{};adapters.add(a);apply('register');return()=>adapters.delete(a)}
 addEventListener('worldqualitysample',e=>sample(e.detail||{}));
 window.CinematicTemporalQualityGovernor={version:'1.0.0',register,sample,getState:()=>({...state}),getSamples:()=>samples.slice()};
})();
