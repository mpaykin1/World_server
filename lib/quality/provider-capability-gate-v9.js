'use strict';
function evaluateCapabilities(requirements,providers){const holds=[];const matched={};for(const req of requirements||[]){const p=(providers||[]).find(x=>x&&x.verified===true&&x.simulated!==true&&(x.capabilities||[]).includes(req));if(!p)holds.push({capability:req,reason:'no-verified-real-provider'});else matched[req]=p.name||p.provider||'provider';}return {ok:holds.length===0,status:holds.length?'HOLD':'PASS',holds,matched,rule:'simulated/unverified providers never satisfy promotion gates'};}
module.exports={evaluateCapabilities};
