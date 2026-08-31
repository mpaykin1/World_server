#!/usr/bin/env node
'use strict';
const {cycle}=require('../lib/collective-brain');
cycle(process.cwd()).then(r=>{console.log(`[COLLECTIVE_BRAIN] ${r.status} sync=${r.sync||'n/a'}`);if(r.status==='FAIL')process.exitCode=1;}).catch(e=>{console.error('[COLLECTIVE_BRAIN]',e.message);process.exitCode=1;});
