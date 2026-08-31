#!/usr/bin/env node
'use strict';
const {replay}=require('../lib/collective-brain');const r=replay(process.cwd());console.log(`[COLLECTIVE_BRAIN_REPLAY] ${r.status} events=${r.chain.count}`);if(r.status!=='PASS')process.exitCode=1;
