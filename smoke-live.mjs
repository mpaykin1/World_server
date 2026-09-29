const base = 'https://world-server.mmmpaykin.workers.dev';
const expected = process.argv[2] || '';
const checks = [];
async function check(label, fn) {
  try { const data = await fn(); checks.push({label,ok:true,detail:data}); }
  catch (e) { checks.push({label,ok:false,error:String(e.message).slice(0,160)}); }
}
await check('exact-production-sha', async()=>{
  const r=await fetch(base+'/api/config',{cache:'no-store'}), j=await r.json();
  if(!r.ok||j.deployedRevision!==expected)throw Error('unexpected release '+j.deployedRevision);
  return j.deployedRevision;
});
await check('groq-binding-configured',async()=>{
  const r=await fetch(base+'/api/chain-ai',{cache:'no-store'}), j=await r.json();
  if(!r.ok||j.providers?.groq!==true)throw Error('Groq secret not bound to production');
  return j.providers;
});
await check('game-cors-preflight',async()=>{
  const r=await fetch(base+'/api/chain-ai',{method:'OPTIONS',
    headers:{origin:'https://mpaykin1.github.io','access-control-request-method':'POST'}});
  if(r.status!==204||r.headers.get('access-control-allow-origin')!=='https://mpaykin1.github.io')throw Error('CORS not ready');
  return r.status;
});
await check('real-groq-provider-response',async()=>{
  const r=await fetch(base+'/api/chain-ai',{method:'POST',
    headers:{origin:'https://mpaykin1.github.io','content-type':'application/json'},
    body:JSON.stringify({text:'Создай готический город с домами',provider:'groq'})});
  const j=await r.json();
  if(!r.ok||!j.ok||j.provider!=='groq'||!j.proposal?.commands?.length||j.executed!==false)
    throw Error('HTTP '+r.status+' '+JSON.stringify(j).slice(0,240));
  return {provider:j.provider,commands:j.proposal.commands.map(x=>x.kind),executed:j.executed};
});
await check('telegram-webhook-ready',async()=>{
  const r=await fetch(base+'/api/telegram/status'),j=await r.json();
  if(!r.ok||!j.ready||!j.webhookMatches)throw Error('Telegram webhook not healthy');
  return {ready:j.ready,webhookMatches:j.webhookMatches};
});
console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length,checks},null,2));
process.exitCode=checks.some(x=>!x.ok)?1:0;
