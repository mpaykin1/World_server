'use strict';

(function install(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorldLivingNpcRpg = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const PARTY_COMMANDS = Object.freeze(['follow','hold','guard','patrol','attack','retreat']);
  const CLASS_DEFS = Object.freeze({
    warrior:{health:20,stamina:20,strength:3,dexterity:0,focus:0,tags:['melee','frontline']},
    knight:{health:30,stamina:12,strength:2,dexterity:0,focus:1,tags:['guard','parry','frontline']},
    rogue:{health:0,stamina:28,strength:0,dexterity:3,focus:1,tags:['roll','flank','critical']},
    archer:{health:0,stamina:18,strength:0,dexterity:3,focus:2,tags:['ranged','scout']},
    healer:{health:10,stamina:5,strength:0,dexterity:0,focus:4,tags:['heal','support']},
    mage:{health:-5,stamina:10,strength:0,dexterity:1,focus:5,tags:['magic','control']}
  });
  const DEFAULT_COMBAT = Object.freeze({
    perfectParryMs:180, blockMultiplier:0.5, parryStaminaCost:8,
    rollStaminaCost:18, rollIFramesMs:320, rollCooldownMs:650
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const finite = (value, fallback=0) => { const n=Number(value); return Number.isFinite(n)?n:fallback; };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const actorId = value => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(value);

  function createProgression(classId='warrior') {
    const safeClass = own(CLASS_DEFS,classId) ? classId : 'warrior';
    return {
      classId:safeClass, level:1, xp:0, skillPoints:0,
      attributes:{health:100,stamina:100,strength:5,dexterity:5,focus:5}
    };
  }

  function createRelationship() {
    return {trust:0,affection:0,respect:0,fear:0,history:[]};
  }

  function createCombatState() {
    return {guardStartedAt:null,lastRollAt:null,invulnerableUntil:0,stamina:100,state:'idle'};
  }

  function createActor(input={}) {
    const id = String(input.id || '').trim();
    if (!actorId(id)) throw new Error('valid actor id is required');
    return {
      id,
      name:String(input.name || id),
      kind:input.kind === 'player' ? 'player' : 'npc',
      faction:String(input.faction || 'neutral'),
      recruited:false,
      progression:createProgression(input.classId),
      relationship:createRelationship(),
      combat:createCombatState(),
      memory:[]
    };
  }

  function xpToNext(level) {
    const n = Math.max(1, Math.floor(Number(level) || 1)) - 1;
    return 100 + 40*n + 15*n*n;
  }

  function awardXp(actor, amount) {
    const next = copy(actor);
    next.progression.xp += Math.max(0, Math.floor(finite(amount,0)));
    let gained = 0;
    while (next.progression.xp >= xpToNext(next.progression.level)) {
      next.progression.xp -= xpToNext(next.progression.level);
      next.progression.level += 1;
      next.progression.skillPoints += 1;
      gained += 1;
    }
    return {actor:next,levelsGained:gained};
  }

  function spendSkillPoint(actor, attribute, amount=1) {
    const next = copy(actor);
    const points = Math.max(1, Math.floor(Number(amount) || 1));
    if (!own(next.progression.attributes,attribute)) throw new Error('unknown attribute');
    if (next.progression.skillPoints < points) return {actor:next,spent:false};
    next.progression.skillPoints -= points;
    next.progression.attributes[attribute] += points;
    return {actor:next,spent:true};
  }

  function effectiveStats(actor) {
    const base = copy(actor.progression.attributes);
    const def = own(CLASS_DEFS,actor.progression.classId) ? CLASS_DEFS[actor.progression.classId] : CLASS_DEFS.warrior;
    for (const key of ['health','stamina','strength','dexterity','focus']) base[key] += def[key] || 0;
    base.health = Math.max(1, base.health);
    base.stamina = Math.max(0, base.stamina);
    return {...base,tags:[...def.tags]};
  }

  function relationshipBand(relationship) {
    const score = relationship.trust + relationship.affection + relationship.respect - relationship.fear;
    if (score >= 150) return 'devoted';
    if (score >= 90) return 'ally';
    if (score >= 35) return 'friendly';
    if (score <= -90) return 'hostile';
    if (score <= -35) return 'wary';
    return 'neutral';
  }

  function applyRelationshipEvent(actor, event={}) {
    const next = copy(actor);
    for (const key of ['trust','affection','respect','fear']) {
      next.relationship[key] = clamp(next.relationship[key] + (event[key] || 0), -100, 100);
    }
    next.relationship.history.push({
      at:Number(event.at) || Date.now(),
      reason:String(event.reason || 'interaction'),
      trust:event.trust || 0, affection:event.affection || 0,
      respect:event.respect || 0, fear:event.fear || 0
    });
    next.relationship.history = next.relationship.history.slice(-40);
    return next;
  }

  function canRecruit(actor, rules={}) {
    const minTrust = Number.isFinite(rules.minTrust) ? rules.minTrust : 40;
    const minRespect = Number.isFinite(rules.minRespect) ? rules.minRespect : 20;
    const maxFear = Number.isFinite(rules.maxFear) ? rules.maxFear : 45;
    const r = actor.relationship;
    return !actor.recruited && r.trust >= minTrust && r.respect >= minRespect && r.fear <= maxFear;
  }

  function createParty(leaderId, limit=4) {
    return {leaderId:String(leaderId),memberIds:[],limit:Math.max(1,Math.floor(finite(limit,4))),command:'follow',target:null};
  }

  function recruitActor(actor, party, rules={}) {
    if (!canRecruit(actor,rules)) return {actor:copy(actor),party:copy(party),recruited:false};
    if (party.memberIds.length >= party.limit) return {actor:copy(actor),party:copy(party),recruited:false};
    const nextActor = copy(actor);
    const nextParty = copy(party);
    nextActor.recruited = true;
    if (!nextParty.memberIds.includes(nextActor.id)) nextParty.memberIds.push(nextActor.id);
    return {actor:nextActor,party:nextParty,recruited:true};
  }

  function setPartyCommand(party, command, target=null) {
    if (!PARTY_COMMANDS.includes(command)) throw new Error('unknown party command');
    return {...copy(party),command,target:target == null ? null : String(target)};
  }

  function beginGuard(combat, now=Date.now()) {
    return {...copy(combat),guardStartedAt:finite(now,Date.now()),state:'guarding'};
  }

  function endGuard(combat) {
    return {...copy(combat),guardStartedAt:null,state:'idle'};
  }

  function resolveHit(combat, attack={}, now=Date.now(), config={}) {
    const cfg = {...DEFAULT_COMBAT,...config};
    const at=finite(now,Date.now()), parryMs=Math.max(0,finite(cfg.perfectParryMs,DEFAULT_COMBAT.perfectParryMs));
    const parryCost=Math.max(0,finite(cfg.parryStaminaCost,DEFAULT_COMBAT.parryStaminaCost));
    const next = copy(combat);
    if (at < next.invulnerableUntil) return {combat:next,damage:0,result:'iframe'};
    const raw = Math.max(0,finite(attack.damage,0));
    const guarding = next.guardStartedAt != null;
    const age = guarding ? Math.max(0,at-next.guardStartedAt) : Infinity;
    if (guarding && age <= parryMs && next.stamina >= parryCost) {
      next.stamina = clamp(next.stamina-parryCost,0,100);
      next.state = 'parry';
      return {combat:next,damage:0,result:'perfect-parry',staggerAttacker:true};
    }
    if (guarding) return {combat:next,damage:raw*clamp(finite(cfg.blockMultiplier,DEFAULT_COMBAT.blockMultiplier),0,1),result:'block',staggerAttacker:false};
    return {combat:next,damage:raw,result:'hit',staggerAttacker:false};
  }

  function tryRoll(combat, now=Date.now(), config={}) {
    const cfg = {...DEFAULT_COMBAT,...config};
    const at=finite(now,Date.now()), cooldown=Math.max(0,finite(cfg.rollCooldownMs,DEFAULT_COMBAT.rollCooldownMs));
    const cost=Math.max(0,finite(cfg.rollStaminaCost,DEFAULT_COMBAT.rollStaminaCost));
    const iframe=Math.max(0,finite(cfg.rollIFramesMs,DEFAULT_COMBAT.rollIFramesMs)), next=copy(combat);
    const ready = next.lastRollAt == null || at-Number(next.lastRollAt) >= cooldown;
    if (!ready || next.stamina < cost) return {combat:next,rolled:false};
    next.lastRollAt = at;
    next.invulnerableUntil = at+iframe;
    next.stamina = clamp(next.stamina-cost,0,100);
    next.state = 'roll';
    return {combat:next,rolled:true};
  }

  function createDialog(firstPage, pages=[]) {
    const mapped = Object.create(null);
    for (const page of pages) {
      if (!page?.id) continue;
      mapped[page.id] = {id:page.id,title:String(page.title || ''),paragraphs:[...(page.paragraphs || [])],responses:[...(page.responses || [])]};
    }
    if (!mapped[firstPage]) throw new Error('dialog firstPage must exist');
    return {firstPage,pages:mapped};
  }

  function getDialogPage(dialog, pageId) {
    return dialog?.pages?.[pageId] || null;
  }

  function chooseDialogResponse(dialog, pageId, responseIndex) {
    const page = getDialogPage(dialog,pageId);
    const response = page?.responses?.[responseIndex];
    if (!response) return null;
    return {text:String(response.text || ''),nextPage:response.nextPage || null,actions:[...(response.actions || [])]};
  }

  function createWorldRpgState(playerId='player') {
    return {schemaVersion:'1.0.0',actors:{},party:createParty(playerId),dialogs:{}};
  }

  function upsertActor(state, actor) {
    const next = copy(state);
    next.actors[actor.id] = copy(actor);
    return next;
  }

  return Object.freeze({
    PARTY_COMMANDS,CLASS_DEFS,DEFAULT_COMBAT,createActor,createParty,createWorldRpgState,
    xpToNext,awardXp,spendSkillPoint,effectiveStats,relationshipBand,applyRelationshipEvent,
    canRecruit,recruitActor,setPartyCommand,beginGuard,endGuard,resolveHit,tryRoll,
    createDialog,getDialogPage,chooseDialogResponse,upsertActor
  });
});
