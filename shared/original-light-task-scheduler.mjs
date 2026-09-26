/** Original engine-neutral scheduler inspired by Godot's bounded edit streak. */
export function createOriginalLightTaskScheduler({maxEditStreak=32,maxPending=100000}={}){
 if(!Number.isInteger(maxEditStreak)||maxEditStreak<1||maxEditStreak>10000||!Number.isInteger(maxPending)||maxPending<1)throw new RangeError('scheduler options');
 const edits=[],chunks=[],latestEdit=new Map();let streak=0;
 const keyOf=task=>`${task.x},${task.y},${task.z}`;
 const enqueueEdit=task=>{
  if(!task||![task.x,task.y,task.z].every(Number.isInteger))throw new TypeError('edit');
  const key=keyOf(task);
  if(latestEdit.has(key)){const existing=latestEdit.get(key);existing.newValue=task.newValue;return 'coalesced';}
  if(edits.length+chunks.length>=maxPending)return 'full';
  const entry={...task};edits.push(entry);latestEdit.set(key,entry);return 'queued';
 };
 const enqueueChunk=task=>{
  if(!task||!Number.isInteger(task.cx)||!Number.isInteger(task.cz))throw new TypeError('chunk');
  if(edits.length+chunks.length>=maxPending)return 'full';
  chunks.push({...task});return 'queued';
 };
 const next=()=>{
  if(edits.length&&(streak<maxEditStreak||!chunks.length)){
   const task=edits.shift();latestEdit.delete(keyOf(task));streak++;return {kind:'edit',task};
  }
  if(chunks.length){streak=0;return {kind:'chunk',task:chunks.shift()};}
  return null;
 };
 return {enqueueEdit,enqueueChunk,next,pending:()=>({edits:edits.length,chunks:chunks.length,streak})};
}
