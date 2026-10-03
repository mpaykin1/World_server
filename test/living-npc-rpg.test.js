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

test('voxel world loads and initializes the shared living NPC RPG runtime', () => {
  const root = path.join(__dirname,'..');
  const html = fs.readFileSync(path.join(root,'apps','voxel-world','index.html'),'utf8');
  const client = fs.readFileSync(path.join(root,'apps','voxel-world','client.js'),'utf8');
  assert.match(html,/living-npc-rpg-runtime\.js/);
  assert.match(client,/function initializeLivingNpcRpg\(\)/);
  assert.match(client,/typeof runtime\?\.createWorldRpgState!==['\"]function['\"]/);
  assert.match(client,/Voxel World continues without NPC RPG features/);
});
