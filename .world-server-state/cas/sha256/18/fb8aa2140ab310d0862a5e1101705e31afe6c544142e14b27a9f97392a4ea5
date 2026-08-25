'use strict';
function evaluateGoldenQuarantine(verification,lock){const items=[];for(const d of verification?.drift||[])items.push({component:d.id,reason:d.reason,severity:'blocker',freezePropagation:true});for(const c of lock?.components||[])if(c.status==='awaiting-source'||c.verified===false)items.push({component:c.id,reason:'unverified-canonical',severity:'hold',freezePropagation:true});return {version:9,quarantined:items.length>0,items,action:items.length?'FREEZE_GOLDEN_PROPAGATION':'ALLOW_VERIFIED_PROPAGATION'};}
module.exports={evaluateGoldenQuarantine};
