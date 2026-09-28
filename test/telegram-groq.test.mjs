import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretAmbiguousStory} from '../telegram-groq.mjs';
import {initialWorld} from '../telegram-state.mjs';
import {applyStoryText,applyStoryAction,applyInterpretedStory} from '../telegram-story.mjs';

test('Groq is optional and never called without a secret',async()=>{
  const result=await interpretAmbiguousStory({},initialWorld(1),'люди стреляют',
    ()=>{throw Error('should not call');});
  assert.equal(result,null);
});
test('Groq returns only allowlisted intent and uses prior story context',async()=>{
  const world=applyStoryText(initialWorld(2),'прилетел дракон').world;
  const result=await interpretAmbiguousStory({GROQ_API_KEY:'test'},world,
    'люди открыли огонь',async(url,options)=>{
      assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(options.headers.authorization,'Bearer test');
      const prompt=JSON.parse(options.body).messages[1].content;
      assert.equal(JSON.parse(prompt).context,'dragon_arrival');
      return {ok:true,json:async()=>({choices:[{message:{content:
        '{"type":"action","value":"defend"}'}}]})};
    });
  assert.deepEqual(result,{kind:'action',action:'defend'});
});
test('Groq rejects invented actions and tolerates upstream failures',async()=>{
  const world=initialWorld(3);
  const fake=async()=>({ok:true,json:async()=>({choices:[
    {message:{content:'{"type":"action","value":"delete_world"}'}}]})});
  assert.equal(await interpretAmbiguousStory({GROQ_API_KEY:'test'},world,'x',fake),null);
  assert.equal(await interpretAmbiguousStory({GROQ_API_KEY:'test'},world,'x',
    async()=>{throw Error('429');}),null);
});
test('Dragon arrival followed by shooting causes a persisted defence result',()=>{
  const arrived=applyStoryText(initialWorld(4),'прилетел дракон');
  assert.equal(arrived.world.story.active,null);
  const response=applyStoryAction(arrived.world,'defend','люди в него стреляют');
  assert.equal(response.accepted,true);
  assert.equal(response.world.story.active,null);
  assert.match(response.world.story.last.description,/Дракон отступил/);
});
test('Unrecognized model output does not apply simulation changes',()=>{
  const world=initialWorld(5);
  const response=applyInterpretedStory(world,'мир становится фиолетовым',{kind:'delete_world'});
  assert.equal(response.world.population,world.population);
  assert.equal(response.kind,'unknown');
});

test('Telegram Groq retries current free GPT-OSS models after 404',async()=>{
  const models=[];
  const world=applyStoryText(initialWorld(6),'прилетел дракон').world;
  const result=await interpretAmbiguousStory({GROQ_API_KEY:'test'},world,'они атакуют его',
    async(_url,opts)=>{
      models.push(JSON.parse(opts.body).model);
      return models.length===1
        ?new Response('{}',{status:404})
        :Response.json({choices:[{message:{content:'{"type":"action","value":"defend"}'}}]});
    });
  assert.deepEqual(result,{kind:'action',action:'defend'});
  assert.deepEqual(models,['openai/gpt-oss-20b','openai/gpt-oss-120b']);
});
test('Telegram avoids retired and unapproved Groq model overrides',async()=>{
  let called=false;
  const result=await interpretAmbiguousStory({
    GROQ_API_KEY:'test',GROQ_MODEL:'llama-3.3-70b-versatile'
  },initialWorld(7),'нечто произошло',async()=>{
    called=true;throw Error('unexpected call');
  });
  assert.equal(result,null);
  assert.equal(called,false);
});
