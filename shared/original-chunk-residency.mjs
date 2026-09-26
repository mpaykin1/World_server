/** Original engine-independent chunk residency planning and staged readiness. */
export function planOriginalChunkResidency({chunks,center,radius,margin=5}={}){
 if(!Array.isArray(chunks)||!Array.isArray(center)||center.length!==2||!center.every(Number.isInteger)||!Number.isInteger(radius)||radius<0||radius>256||!Number.isInteger(margin)||margin<0||margin>256)throw new RangeError('residency');
 const remove=[];for(const c of chunks){
  if(!c||![c.cx,c.cz,c.busy].every(Number.isInteger)||c.busy<0)throw new RangeError('chunk');
  if(Math.max(Math.abs(c.cx-center[0]),Math.abs(c.cz-center[1]))>radius+margin&&c.busy===0)remove.push(c);
 }
 return remove;
}
export function assessOriginalChunkReadiness({chunks,center,radius}={}){
 if(!(chunks instanceof Map)||!Array.isArray(center)||center.length!==2||!center.every(Number.isInteger)||!Number.isInteger(radius)||radius<0||radius>256)throw new RangeError('readiness');
 let complete=0,total=0,ready=true;
 for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
  total+=4;const c=chunks.get(`${center[0]+dx},${center[1]+dz}`);
  if(!c){ready=false;continue;}
  if(c.terrain)complete++;if(c.final)complete++;if(c.lit)complete++;if(c.rendered)complete++;
  if(!c.lit||!c.rendered)ready=false;
 }
 return {ready,progress:total===0?1:complete/total,complete,total};
}
