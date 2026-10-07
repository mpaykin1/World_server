// Groq interprets ambiguous player prose; the canonical simulator applies effects.
// Never expose API credentials to the browser or Telegram responses.
const EVENTS=new Set(['dragon_arrival','dragon_fire','dragon_help','fire','flood',
  'storm','earthquake','meteor','epidemic','attack','drought','rain','forest',
  'festival','trade','rescue']);
const ACTIONS=new Set(['extinguish','evacuate','defend','rebuild','relief']);
const FREE_MODELS=['openai/gpt-oss-20b','openai/gpt-oss-120b'];
export async function interpretAmbiguousStory(env,world,text,fetcher=fetch){
  const key=String(env?.GROQ_API_KEY||'').trim();
  if(!key)return null;
  const model=env.GROQ_MODEL||FREE_MODELS[0];
  if(!FREE_MODELS.includes(model))return null;
  const context=world.story?.active?.kind||world.story?.last?.kind||'none';
  const messages=[
    {role:'system',content:'Interpret a fictional city-game event. Return ONLY JSON with "type" ("event", "action", or "unknown") and "value". Events: '+[...EVENTS].join(', ')+'. Actions: '+[...ACTIONS].join(', ')+'. Consider context for pronouns. Never invent buildings or modify resources. If unsure choose unknown.'},
    {role:'user',content:JSON.stringify({context,text:String(text).slice(0,600)})}
  ];
  try{
    for(const selected of [model,...FREE_MODELS.filter(x=>x!==model)]){
      const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
        body:JSON.stringify({model:selected,max_completion_tokens:450,
          reasoning_effort:'low',include_reasoning:false,
          response_format:{type:'json_object'},messages}),
        signal:AbortSignal.timeout(4500)
      });
      if(response.status===404||response.status===403)continue;
      if(!response.ok)return null;
      const data=await response.json();
      const raw=data?.choices?.[0]?.message?.content;
      if(typeof raw!=='string'||raw.length>1000)return null;
      const answer=JSON.parse(raw);
      if(answer.type==='event'&&EVENTS.has(answer.value))return{kind:answer.value};
      if(answer.type==='action'&&ACTIONS.has(answer.value))
        return{kind:'action',action:answer.value};
      return null;
    }
  }catch{ /* Free-tier throttling, timeouts, and malformed model output fail closed. */ }
  return null;
}
