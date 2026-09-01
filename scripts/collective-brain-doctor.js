#!/usr/bin/env node
'use strict';
const {doctor}=require('../lib/collective-brain');
const {run: ordinaryChatCheck}=require('./openhuman-ordinary-chat-check');
const {run: localAccessCheck}=require('./openhuman-local-access-check');
doctor(process.cwd()).then(async r=>{
  console.log(`[COLLECTIVE_BRAIN_DOCTOR] ${r.status} agentmemory=${r.agentmemory.ok?'UP':'DOWN'} ollama=${r.ollama.ok?'UP':'DOWN'}`);
  try {
    const oc = await ordinaryChatCheck(process.cwd());
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] OpenHuman ordinary chat shared memory: ${oc.ordinaryChat} (REST cross-memory: ${oc.restCrossMemory})`);
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] World_server knowledge: ${oc.knowledge.status === 'PRESENT' ? 'PRESENT' : oc.knowledge.status === 'MISSING' ? 'MISSING' : 'STALE'} (${oc.knowledge.entryCount || 0} entries)`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] OpenHuman ordinary chat shared memory: NOT_VERIFIED (check failed: ${e.message})`);
  }
  try {
    const la = localAccessCheck();
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] OpenHuman action directory: C:\\Users\\user\\Desktop\\World_server`);
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Local World_server access: ${la.configured} (UI verified: ${la.uiVerified})`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Local World_server access: NOT_CONFIGURED (check failed: ${e.message})`);
  }
  if(r.status!=='PASS')process.exitCode=1;
}).catch(e=>{console.error(e);process.exitCode=1;});
