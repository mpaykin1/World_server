'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const R=require('../shared/living-npc-rpg-runtime');

test('relationships recruit party members',()=>{
  let npc=R.createActor({id:'mira',classId:'archer'});
  npc=R.applyRelationshipEvent(npc,{trust:45,respect:25});
  const result=R.recruitActor(npc,R.createParty('player',3));
  assert.deepEqual([R.relationshipBand(npc.relationship),R.canRecruit(npc),result.recruited,result.party.memberIds],
    ['friendly',true,true,['mira']]);
});

test('class progression and input invariants',()=>{
  let actor=R.createActor({id:'hero',classId:'knight'});
  actor=R.awardXp(actor,R.xpToNext(1)+R.xpToNext(2)).actor;
  const spent=R.spendSkillPoint(actor,'strength');
  assert.deepEqual([actor.progression.level,actor.progression.skillPoints,spent.spent,
    spent.actor.progression.attributes.strength],[3,2,true,6]);
  assert.ok(R.effectiveStats(spent.actor).tags.includes('parry'));
  const rogue=R.effectiveStats(R.createActor({id:'rogue',classId:'rogue'}));
  const mage=R.effectiveStats(R.createActor({id:'mage',classId:'mage'}));
  assert.deepEqual([rogue.health,mage.health],[100,95]);
  const safe=R.createActor({id:'safe-class',classId:'toString'});
  assert.equal(safe.progression.classId,'warrior');
  assert.throws(()=>R.spendSkillPoint(safe,'toString'),/unknown attribute/);
  assert.equal(R.awardXp(safe,Infinity).actor.progression.xp,0);
  assert.throws(()=>R.createActor({id:'__proto__'}),/valid actor id/);
  assert.equal(R.createParty('player',NaN).limit,4);
});

test('parry block and roll timing are deterministic',()=>{
  const base=R.createActor({id:'guard'}).combat, guard=R.beginGuard(base,1000);
  const parry=R.resolveHit(guard,{damage:20},1100), block=R.resolveHit(guard,{damage:20},1400);
  assert.deepEqual([parry.result,parry.damage,parry.staggerAttacker,block.result,block.damage],
    ['perfect-parry',0,true,'block',10]);
  const roll=R.tryRoll(base,2000);
  assert.deepEqual([roll.rolled,roll.combat.state,roll.combat.invulnerableUntil],[true,'roll',2320]);
  const iframe=R.resolveHit(roll.combat,{damage:99},2000);
  assert.deepEqual([iframe.result,iframe.damage,R.tryRoll(roll.combat,2400).rolled,
    R.tryRoll(roll.combat,2700).rolled],['iframe',0,false,true]);
});

test('dialog graph branches safely',()=>{
  const dialog=R.createDialog('hello',[
    {id:'hello',title:'Mira',responses:[{text:'Join me',nextPage:'join',actions:[{type:'relationship',trust:5}]}]},
    {id:'join',responses:[]}]);
  const choice=R.chooseDialogResponse(dialog,'hello',0);
  assert.deepEqual([R.getDialogPage(dialog,'hello').title,choice.nextPage,choice.actions[0].trust],
    ['Mira','join',5]);
  const proto=R.createDialog('__proto__',[{id:'__proto__',responses:[]}]);
  assert.equal(R.getDialogPage(proto,'__proto__').id,'__proto__');
});

test('combat state survives JSON round-trip',()=>{
  const roundTrip=JSON.parse(JSON.stringify(R.createActor({id:'json-guard'}).combat));
  assert.deepEqual([roundTrip.lastRollAt,R.tryRoll(roundTrip,1000).rolled],[null,true]);
});

test('voxel world loads RPG runtime before client',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','apps','voxel-world','index.html'),'utf8');
  assert.ok(html.indexOf('/shared/living-npc-rpg-runtime.js')>=0);
  assert.ok(html.indexOf('./client.js')>html.indexOf('/shared/living-npc-rpg-runtime.js'));
});
