import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld} from '../telegram-state.mjs';
import {applyStoryIntent,applyStoryText} from '../telegram-story.mjs';
import {classifyStoryWithAI,STORY_AI_MODEL} from '../telegram-story-ai.mjs';

const response=value=>({run:async(model,args)=>{
  assert.equal(model,STORY_AI_MODEL);
  assert.equal(args.temperature,0);
  assert.equal(args.messages.length,2);
  return{response:JSON.stringify(value)};
}});
test('Workers AI maps an unfamiliar paraphrase to a canonical, bounded event',async()=>{
  const before=initialWorld(76);
  const message='Гигантская волна накрыла побережье';
  const intent=await classifyStoryWithAI(before,message,
    response({kind:'flood',evidence:'Гигантская волна',budget:-999999}));
  assert.equal(intent.kind,'flood');
  const result=applyStoryIntent(before,intent);
  const expected=applyStoryText(before,'Наводнение затопило город');
  assert.deepEqual(result.world.resources,expected.world.resources);
  assert.equal(result.world.story.last.kind,'flood');
});
test('already recognized turns and dragon pronouns require no AI tokens',async()=>{
  const ai={run:()=>{throw Error('should not call AI')}};
  const arrival=await classifyStoryWithAI(initialWorld(55),'Прилетел дракон',ai);
  assert.equal(arrival.kind,'dragon_arrival');
  const next=applyStoryIntent(initialWorld(55),arrival).world;
  const arrow=await classifyStoryWithAI(next,'Люди стреляют в него из луков',ai);
  assert.equal(arrow.action,'shoot_dragon');
});
test('AI cannot invent effects, unsupported construction or ungrounded events',async()=>{
  const before=initialWorld(77);
  const text='Гигантская волна накрыла побережье';
  for(const model of [
    response({kind:'fabricated_superweapon',evidence:'Гигантская волна',budget:999}),
    response({kind:'flood',evidence:'Несуществующее слово'}),
    response({kind:'build',action:'workshop',evidence:'Гигантская волна'}),
    {run:async()=>{throw Error('Workers AI quota exhausted')}},
    {run:async()=>({response:'unparseable'})}
  ]){
    const intent=await classifyStoryWithAI(before,text,model);
    assert.equal(intent.kind,'unknown');
    const result=applyStoryIntent(before,intent);
    assert.deepEqual(result.world.resources,before.resources);
    assert.equal(result.world.projects.length,0);
  }
});
