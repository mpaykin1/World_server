'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const R=require('../shared/living-npc-rpg-runtime');

test('relationships recruit party members',()=>{
  let npc=R.createActor({id:'mira',classId:'archer'});
  npc=R.applyRelationshipEvent(npc,{trust:45,respect:25});
  const result=R.recruitActor(npc,R.createParty('player',3));
  assert.deepEqual([R.relationshipBand(npc.relationship),R.canRecruit(npc),result.recruited,result.party.memberIds],
    ['friendly',true,true,['mira']]);
});

test('relationship event preserves explicit zero timestamp',()=>{
  const npc=R.createActor({id:'epoch-npc'});
  const next=R.applyRelationshipEvent(npc,{at:0,reason:'epoch'});
  assert.equal(next.relationship.history.at(-1).at,0);
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
  const unguarded=R.resolveHit(base,{damage:20},900);
  const beforeGuard=R.resolveHit(guard,{damage:20},900);
  const parry=R.resolveHit(guard,{damage:20},1100), block=R.resolveHit(guard,{damage:20},1400);
  assert.deepEqual([unguarded.result,unguarded.damage,beforeGuard.result,beforeGuard.damage,parry.result,parry.damage,parry.staggerAttacker,block.result,block.damage],
    ['hit',20,'hit',20,'perfect-parry',0,true,'block',10]);
  const roll=R.tryRoll(base,2000);
  assert.deepEqual([roll.rolled,roll.combat.state,roll.combat.invulnerableUntil],[true,'roll',2320]);
  const iframe=R.resolveHit(roll.combat,{damage:99},2000);
  const iframeNearEnd=R.resolveHit(roll.combat,{damage:99},2300);
  assert.deepEqual([iframeNearEnd.result,iframeNearEnd.damage],['iframe',0]);
  assert.deepEqual([iframe.result,iframe.damage,R.tryRoll(roll.combat,2400).rolled,
    R.tryRoll(roll.combat,2700).rolled],['iframe',0,false,true]);
});

test('iframe dominates guard timing even when guard state is present',()=>{
  const base=R.createActor({id:'guard-roll'}).combat;
  const guarded=R.beginGuard(base,900);
  const rolled=R.tryRoll(guarded,1000);
  assert.equal(rolled.rolled,true);
  assert.equal(rolled.combat.invulnerableUntil,1320);
  const hit=R.resolveHit(rolled.combat,{damage:50},1300);
  assert.deepEqual([hit.result,hit.damage],['iframe',0]);
});

test('invalid timestamps fall back before iframe math',()=>{
  const realNow=Date.now;
  Date.now=()=>1000;
  try {
    const base=R.createActor({id:'nan-roll'}).combat;
    const rolled=R.tryRoll(base,NaN);
    assert.equal(rolled.rolled,true);
    assert.equal(rolled.combat.invulnerableUntil,1320);
    const hitNaN=R.resolveHit(rolled.combat,{damage:99},NaN);
    const hitText=R.resolveHit(rolled.combat,{damage:99},'not-a-time');
    assert.deepEqual([hitNaN.result,hitNaN.damage,hitText.result,hitText.damage],['iframe',0,'iframe',0]);
  } finally {
    Date.now=realNow;
  }
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
