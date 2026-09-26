import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {initialWorld,engine,applyPlan,view} from '../telegram-state.mjs';
import {
  SCENE_ROOT,MEDIA_SCENES,classifyTurn,turnDescription,sceneMedia,makeVisualTurn
} from '../telegram-scenes.mjs';

const files=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../apps/telegram-scenes/media');
const manifestFile=path.resolve(files,'../manifest.json');

test('every scene has three distinct, valid offline-rendered PNG variants',()=>{
  assert(existsSync(manifestFile),'Run tools/generate-telegram-scenes.py first');
  const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
  assert.equal(manifest.scenes.length,MEDIA_SCENES.length*3);
  const observed=new Set();
  for(const id of MEDIA_SCENES){
    const matches=manifest.scenes.filter(scene=>scene.id===id);
    assert.equal(matches.length,3,'Missing scene '+id);
    const hashes=new Set();
    for(const scene of matches){
      assert(scene.photo.startsWith(id+'-'));
      const png=path.resolve(files,scene.photo);
      assert(existsSync(png),png);
      const bytes=readFileSync(png);
      assert(bytes.length>1000);
      assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
      hashes.add(bytes.toString('base64'));
      if(scene.animation){
        const mp4=readFileSync(path.resolve(files,scene.animation));
        assert(mp4.length>4000,'Tiny/broken video: '+scene.animation);
        assert.equal(mp4.subarray(4,8).toString('ascii'),'ftyp');
      }
      observed.add(scene.photo);
    }
    assert.equal(hashes.size,3,'Variants are identical: '+id);
  }
  assert.equal(observed.size,MEDIA_SCENES.length*3);
});

test('new world, project construction, progress and commissioning render different scenes',()=>{
  const origin=initialWorld(42);
  const created=classifyTurn(origin,origin,'new');
  assert.equal(created.id,'origin');
  const solar=applyPlan(origin,'solar');
  assert.equal(solar.accepted,true);
  const started=classifyTurn(origin,solar.world,'start');
  assert.equal(started.id,'start_solar');
  assert.match(turnDescription(origin,solar.world,started),/Город вложил ресурсы/);
  const middle=engine.tick(solar.world);
  const ongoing=classifyTurn(solar.world,middle,'day');
  assert.equal(ongoing.id,'progress_solar');
  const completed=engine.tick(middle);
  assert.equal(classifyTurn(middle,completed,'day').id,'done_solar');
  assert.match(turnDescription(middle,completed,classifyTurn(middle,completed,'day')),
    /Объект готов/);
});

test('critical resource shortages, recovery and accident each show their own imagery',()=>{
  const w=initialWorld(3);
  const crisis=structuredClone(w);crisis.resources.water=4;crisis.crisis=true;
  assert.equal(classifyTurn(w,crisis,'day').id,'crisis_water');
  assert.equal(classifyTurn(crisis,w,'day').id,'recovery');
  const accident=structuredClone(w);
  accident.history.push({tick:1,kind:'accident'});
  assert.equal(classifyTurn(w,accident,'day').id,'accident');
});

test('all 20 canonical project types resolve to real media categories',()=>{
  const world=initialWorld(42);
  for(const type of Object.keys(engine.PROJECTS)){
    const scene=classifyTurn(world,world,'start',type);
    assert(MEDIA_SCENES.includes(scene.id),'Missing project scene '+type);
    const media=sceneMedia(scene,world,61);
    assert(media.animation.startsWith(SCENE_ROOT));
    assert(media.photo.startsWith(SCENE_ROOT));
  }
});

test('repeated turns get different visual variants; captions fit Telegram media',()=>{
  const w=initialWorld(42);
  const scene=classifyTurn(w,w,'new');
  const variants=new Set(Array.from({length:30},(_,i)=>
    sceneMedia(scene,{...w,revision:i},1000+i).variant));
  assert.equal(variants.size,3);
  const actions=['new','plan','blocked','resume','stale','day'];
  for(const action of actions){
    const turn=makeVisualTurn(w,w,action,'',345,view(w));
    assert(turn.text.length<=1024);
    assert(turn.media.photo.endsWith('.png'));
    assert(turn.media.scene&&MEDIA_SCENES.includes(turn.scene));
    assert(turn.reply_markup.inline_keyboard.length>=3);
  }
});
