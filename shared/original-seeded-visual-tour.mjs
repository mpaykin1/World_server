/** Original declarative screenshot tour; independent of renderer and upstream code. */
const SCENES=Object.freeze([
 ['overworld_day','overworld',6000,[0,85,0],[0,-0.25,0]],
 ['overworld_dusk','overworld',12000,[0,85,0],[0,-0.25,0]],
 ['overworld_night','overworld',18000,[0,85,0],[0,-0.25,0]],
 ['forest','overworld',6000,[128,82,128],[0,-0.2,0]],
 ['cave','overworld',6000,[32,22,32],[0,0,0]],
 ['volcano','overworld',12000,[256,110,256],[0,-0.3,0]],
 ['nether','nether',6000,[0,76,0],[0,-0.2,0]],
 ['end','end',6000,[0,75,0],[0,-0.2,0]]
]);
function seedValue(seed){if(!Number.isSafeInteger(seed))throw new RangeError('seed');return seed>>>0;}
export function originalVisualTour(seed=4242){
 const normalized=seedValue(seed);
 return SCENES.map(([id,dimension,time,camera,rotation],index)=>({
  id,seed:normalized,dimension,time,camera:[...camera],rotation:[...rotation],
  filename:`${String(index+1).padStart(2,'0')}_${id}_${normalized}.png`,
  warmupTicks:dimension==='overworld'?80:120,
  metrics:['fps','drawCalls','triangles','visibleChunks','missingTextures','errors']
 }));
}
export function validateOriginalTourResult(tour,results){
 if(!Array.isArray(tour)||!Array.isArray(results))throw new TypeError('tour/results');
 const byId=new Map(results.map(x=>[x?.id,x]));
 return tour.map(scene=>{
  const result=byId.get(scene.id),errors=[];
  if(!result)errors.push('missing scene');
  else {
   if(result.seed!==scene.seed)errors.push('seed mismatch');
   if(typeof result.screenshot!=='string'||!result.screenshot.endsWith('.png'))errors.push('missing screenshot');
   for(const key of scene.metrics)if(key!=='errors'&&(!Number.isFinite(result[key])||result[key]<0))errors.push('invalid '+key);
   if(!Array.isArray(result.errors)||result.errors.length)errors.push('runtime errors');
  }
  return {id:scene.id,pass:errors.length===0,errors};
 });
}
