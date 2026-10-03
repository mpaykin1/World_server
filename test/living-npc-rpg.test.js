'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../shared/living-npc-rpg-runtime');

test('relationship progression unlocks recruitment and party membership', () => {
  let npc = R.createActor({id:'mira',name:'Mira',classId:'archer'});
  npc = R.applyRelationshipEvent(npc,{trust:45,respect:25,reason:'rescued village'});
  assert.equal(R.relationshipBand(npc.relationship),'friendly');
  assert.equal(R.canRecruit(npc),true);
  const result = R.recruitActor(npc,R.createParty('player',3));
  assert.equal(result.recruited,true);
  assert.deepEqual(result.party.memberIds,['mira']);
});

test('class progression awards levels and spends skill points', () => {
  let actor = R.createActor({id:'hero',kind:'player',classId:'knight'});
  const gained = R.awardXp(actor,R.xpToNext(1)+R.xpToNext(2));
  actor = gained.actor;
  assert.equal(actor.progression.level,3);
  assert.equal(actor.progression.skillPoints,2);
  const spent = R.spendSkillPoint(actor,'strength');
  assert.equal(spent.spent,true);
  assert.equal(spent.actor.progression.attributes.strength,6);
  assert.ok(R.effectiveStats(spent.actor).tags.includes('parry'));
});

test('class definitions are modifiers, never zero-health spawn values', () => {
  const rogue = R.effectiveStats(R.createActor({id:'rogue',classId:'rogue'}));
  const mage = R.effectiveStats(R.createActor({id:'mage',classId:'mage'}));
  assert.equal(rogue.health,100);
  assert.equal(mage.health,95);
  assert.ok(rogue.health > 0 && mage.health > 0);
});

test('perfect parry, normal block and dodge roll are deterministic', () => {
  const base = R.createActor({id:'guard'}).combat;
  const guarding = R.beginGuard(base,1000);
  const parry = R.resolveHit(guarding,{damage:20},1100);
  assert.equal(parry.result,'perfect-parry');
  assert.equal(parry.damage,0);
  assert.equal(parry.staggerAttacker,true);
  const block = R.resolveHit(guarding,{damage:20},1400);
  assert.equal(block.result,'block');
  assert.equal(block.damage,10);
  const roll = R.tryRoll(base,2000);
  assert.equal(roll.rolled,true);
  const iframe = R.resolveHit(roll.combat,{damage:99},2200);
  assert.equal(iframe.result,'iframe');
  assert.equal(iframe.damage,0);
  const cooldown = R.tryRoll(roll.combat,2400);
  assert.equal(cooldown.rolled,false);
  const readyAgain = R.tryRoll(roll.combat,2700);
  assert.equal(readyAgain.rolled,true);
});

test('dialog graph supports branching responses and actions', () => {
  const dialog = R.createDialog('hello',[
    {id:'hello',title:'Mira',paragraphs:['Need help?'],responses:[
      {text:'Join me',nextPage:'join',actions:[{type:'relationship',trust:5}]}
    ]},
    {id:'join',title:'Mira',paragraphs:['Maybe.'],responses:[]}
  ]);
  assert.equal(R.getDialogPage(dialog,'hello').title,'Mira');
  const choice = R.chooseDialogResponse(dialog,'hello',0);
  assert.equal(choice.nextPage,'join');
  assert.equal(choice.actions[0].trust,5);
});

test('combat state survives JSON round-trip without corrupting roll readiness', () => {
  const combat = R.createActor({id:'json-guard'}).combat;
  const roundTrip = JSON.parse(JSON.stringify(combat));
  assert.equal(roundTrip.lastRollAt,null);
  assert.equal(R.tryRoll(roundTrip,1000).rolled,true);
});

test('voxel world loads the shared living NPC RPG runtime before client module', () => {
  const root = path.join(__dirname,'..');
  const html = fs.readFileSync(path.join(root,'apps','voxel-world','index.html'),'utf8');
  const runtimeAt = html.indexOf('/shared/living-npc-rpg-runtime.js');
  const clientAt = html.indexOf('./client.js');
  assert.ok(runtimeAt >= 0);
  assert.ok(clientAt > runtimeAt);
});
