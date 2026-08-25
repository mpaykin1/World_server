'use strict';
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function detailBudget({importance=.5,distance=0,hero=false,mobile=false,pressure=0}={}){
  const imp=clamp(Number(importance)||0,0,1),dist=Math.max(0,Number(distance)||0),p=clamp(Number(pressure)||0,0,1);
  const near=1/(1+dist/28),heroBoost=hero?.28:0,mobilePenalty=mobile?.14:0;
  const score=clamp(.12+.58*imp+.30*near+heroBoost-mobilePenalty-.38*p,0,1);
  return {
    score:+score.toFixed(4),
    voxelScale:+clamp(.25+score*1.05,.25,1.3).toFixed(3),
    textureScale:+clamp(.35+score*.85,.35,1.2).toFixed(3),
    animationScale:+clamp(.3+score*.8,.3,1.1).toFixed(3),
    protected:!!hero,
    destructive:false
  };
}
function allocateDetail(items,{mobile=false,pressure=0,totalBudget=1}={}){
  const enriched=(items||[]).map((x,i)=>({...x,_i:i,budget:detailBudget({...x,mobile,pressure})}));
  const sum=enriched.reduce((a,x)=>a+x.budget.score,0)||1;
  return enriched.map(x=>({...x,budget:{...x.budget,share:+(x.budget.score/sum*Math.max(.01,totalBudget)).toFixed(5)}}));
}
module.exports={detailBudget,allocateDetail};
