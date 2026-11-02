'use strict';
// Validates completed game records. Optional new dimensions preserve legacy records.
const FIELDS=Object.freeze(['primaryConflict','twistType','endingType','finalLocation','interferenceSourceType']);
const STAGES=Object.freeze(['завязка','развитие','кульминация','развязка']);

function typesFromChoices(game) {
  return Array.isArray(game?.choices)?game.choices.map(x=>typeof x==='string'?x:x?.type):null;
}
function twistTypes(game) {
  return [game?.twistType,...(Array.isArray(game?.twists)?game.twists.map(t=>typeof t==='string'?t:t?.type):[])].filter(x=>typeof x==='string'&&x.trim());
}
function tempoKey(game) {
  const p=game?.tempoStages;
  if(!p||STAGES.some(k=>typeof p[k]!=='string'||!p[k].trim()))return null;
  return STAGES.map(k=>p[k]).join('|');
}
function checkInternalPacing(game) {
  const errors=[];
  const choices=typesFromChoices(game);
  if(choices) {
    if(choices.some((t,i)=>!t||i&&t===choices[i-1]))errors.push('choices: adjacent type repeated or missing');
    if(choices.filter(x=>x==='для атмосферы').length>choices.length/3)errors.push('choices: too many atmospheric choices');
  }
  if(Array.isArray(game?.twists)) {
    const unique=game.twists.map(x=>typeof x==='string'?x:x?.type);
    if(unique.some(x=>!x)||new Set(unique).size!==unique.length)errors.push('twists: duplicate within game');
  }
  return errors;
}
function validateAdjacentGames(previous,current) {
  if(!previous||!current||typeof previous!=='object'||typeof current!=='object'){
    throw new TypeError('Two completed game records are required');
  }
  const errors=[];
  for(const field of FIELDS){
    if(typeof previous[field]!=='string'||!previous[field].trim()||
       typeof current[field]!=='string'||!current[field].trim()){
      errors.push(field+': missing');
    } else if(previous[field]===current[field]){
      errors.push(field+': repeated');
    }
  }
  const a=tempoKey(previous),b=tempoKey(current);
  if(a&&b&&a===b)errors.push('tempoStages: repeated combination');
  if(previous.repairType&&current.repairType&&previous.repairType===current.repairType){
    errors.push('repairType: repeated');
  }
  const oldChoices=typesFromChoices(previous),newChoices=typesFromChoices(current);
  if(oldChoices&&newChoices&&[...oldChoices].sort().join('|')===[...newChoices].sort().join('|')){
    errors.push('choices: repeated menu');
  }
  errors.push(...checkInternalPacing(current));
  return {ok:errors.length===0,errors};
}
function validateRecentHistory(recentGames,candidate) {
  if(!Array.isArray(recentGames))throw new TypeError('recentGames must be an array');
  if(!candidate||typeof candidate!=='object')throw new TypeError('candidate must be an object');
  const result=recentGames.length?
    validateAdjacentGames(recentGames[recentGames.length-1],candidate):
    {ok:true,errors:checkInternalPacing(candidate)};
  const lastThree=recentGames.slice(-3);
  if(lastThree.some(x=>x&&x.primaryConflict===candidate.primaryConflict)&&
     !result.errors.includes('primaryConflict: repeated'))result.errors.push('primaryConflict: used in last three');
  const previousTypes=new Set(lastThree.flatMap(twistTypes));
  if(twistTypes(candidate).some(type=>previousTypes.has(type))&&
     !result.errors.includes('twistType: repeated'))result.errors.push('twistType: cooldown last three games');
  result.ok=result.errors.length===0;
  return result;
}
module.exports={FIELDS,STAGES,tempoKey,twistTypes,checkInternalPacing,validateAdjacentGames,validateRecentHistory};
