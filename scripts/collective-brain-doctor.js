#!/usr/bin/env node
'use strict';
const {doctor}=require('../lib/collective-brain');doctor(process.cwd()).then(r=>{console.log(`[COLLECTIVE_BRAIN_DOCTOR] ${r.status} agentmemory=${r.agentmemory.ok?'UP':'DOWN'} ollama=${r.ollama.ok?'UP':'DOWN'}`);if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
