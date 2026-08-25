'use strict';
function tuneCpuSceneBudget(metrics={},base={}){
  const pressure=Math.max(Number(metrics.eventLoopLagMs||0)/40,Number(metrics.cpuUtilization||0)/.9,Number(metrics.memoryRatio||0)/.85);
  const level=pressure>1.25?'high':pressure>.9?'medium':'low';
  const out={
    nearGameplayHz:Math.max(30,Number(base.nearGameplayHz||60)),
    nearCollisionHz:Math.max(30,Number(base.nearCollisionHz||60)),
    nearVisualQuality:base.nearVisualQuality||'unchanged',
    midAiHz:Number(base.midAiHz||20),farAiHz:Number(base.farAiHz||10),farPhysicsHz:Number(base.farPhysicsHz||15),streamingBatch:Number(base.streamingBatch||16),level
  };
  if(level==='medium'){out.midAiHz=Math.max(10,Math.floor(out.midAiHz*.75));out.farAiHz=Math.max(4,Math.floor(out.farAiHz*.6));out.farPhysicsHz=Math.max(6,Math.floor(out.farPhysicsHz*.6));out.streamingBatch=Math.max(4,Math.floor(out.streamingBatch*.75));}
  if(level==='high'){out.midAiHz=Math.max(8,Math.floor(out.midAiHz*.5));out.farAiHz=Math.max(2,Math.floor(out.farAiHz*.35));out.farPhysicsHz=Math.max(4,Math.floor(out.farPhysicsHz*.35));out.streamingBatch=Math.max(2,Math.floor(out.streamingBatch*.5));}
  out.nearFieldPreserved=out.nearVisualQuality==='unchanged'&&out.nearGameplayHz>=30&&out.nearCollisionHz>=30;return out;
}
module.exports={tuneCpuSceneBudget};
