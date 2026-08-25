'use strict';
function rankDependencyCandidates(candidates=[]){return candidates.map(c=>{const failed=Number(c.failedTests||0);const vulnerabilities=Number(c.vulnerabilities||0);const sizeDelta=Number(c.bundleBytesDelta||0);const perf=Number(c.performanceDelta||0);const utility=perf*4-failed*1000-vulnerabilities*500-Math.max(0,sizeDelta)/1048576;return{...c,utility,acceptable:failed===0&&vulnerabilities===0};}).sort((a,b)=>b.utility-a.utility);}
function chooseDependencyUpgrade(candidates=[]){return rankDependencyCandidates(candidates).find(c=>c.acceptable)||null;}
module.exports={chooseDependencyUpgrade,rankDependencyCandidates};
