#!/usr/bin/env node
'use strict';
const {doctor}=require('../lib/collective-brain');
const {run: ordinaryChatCheck}=require('./openhuman-ordinary-chat-check');
const {run: localAccessCheck}=require('./openhuman-local-access-check');
const {run: launchCheck}=require('./openhuman-launch-check');
const {run: localChatE2eCheck}=require('./openhuman-local-chat-e2e-check');
const {run: anythingllmHealthCheck}=require('./anythingllm-health-check');
const fs=require('fs'),path=require('path');
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
  try {
    const lc = launchCheck();
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] OpenHuman GUI launch: ${lc.gui.guiLaunchVerified} (executable exists: ${lc.gui.executableExists})`);
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Provider routing: ${lc.routing.status}`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] OpenHuman GUI launch: UNKNOWN (check failed: ${e.message})`);
  }
  try {
    const le = await localChatE2eCheck();
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Ollama server: ${le.ollamaServer} | model direct: ${le.modelDirect} | OpenHuman local-model config: ${le.openhumanLocalModelConfig} | OpenHuman ordinary chat (local model): ${le.openhumanOrdinaryChatLocal}`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] OpenHuman local chat E2E: UNKNOWN (check failed: ${e.message})`);
  }
  try {
    const ah = await anythingllmHealthCheck();
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] AnythingLLM integration: ${ah.status} (anythingllm=${ah.anythingllm.up?'UP':'DOWN'} ollama=${ah.ollama.up?'UP':'DOWN'} mcp=${ah.mcpFilesystem.configured?'CONFIGURED':'MISSING'} secretGuard=${ah.secretGuard.status} unsafeMainTreeGrant=${ah.mcpFilesystem.unsafeMainTreeGrant})`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] AnythingLLM integration: UNKNOWN (check failed: ${e.message})`);
  }
  try {
    const reproPath = path.join(__dirname, '..', 'ANYTHINGLLM_E2E_REPRODUCIBILITY.json');
    if (fs.existsSync(reproPath)) {
      const rp = JSON.parse(fs.readFileSync(reproPath, 'utf8'));
      console.log(`[COLLECTIVE_BRAIN_DOCTOR] AnythingLLM E2E reproducibility (${rp.capabilityClass}): ${rp.result} (${rp.passCount}/${rp.totalRuns} PASS, model=${rp.model})`);
    } else {
      console.log('[COLLECTIVE_BRAIN_DOCTOR] AnythingLLM E2E reproducibility: NOT_YET_RUN');
    }
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] AnythingLLM E2E reproducibility: UNKNOWN (check failed: ${e.message})`);
  }
  try {
    const { getResourceState, getOllamaState } = require('../lib/ai-resource-scheduler');
    const [res, oll] = await Promise.all([getResourceState(), getOllamaState()]);
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Resource scheduler live state: cpu=${res.cpuLoadPercent}% ram_free=${res.ramFreePercent}% ollama=${oll.up ? 'UP' : 'DOWN'} loadedModels=[${oll.loadedModels.map((m) => m.name).join(', ')}]`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Resource scheduler: UNKNOWN (check failed: ${e.message})`);
  }
  try {
    const { rankToolsByCost } = require('../lib/tool-cost-model');
    const ranked = rankToolsByCost(['search_files', 'list_directory', 'read_text_file', 'read_file']);
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Tool-cost model: cheapest-first order = [${ranked.join(', ')}]`);
  } catch (e) {
    console.log(`[COLLECTIVE_BRAIN_DOCTOR] Tool-cost model: UNKNOWN (check failed: ${e.message})`);
  }
  if(r.status!=='PASS')process.exitCode=1;
}).catch(e=>{console.error(e);process.exitCode=1;});
