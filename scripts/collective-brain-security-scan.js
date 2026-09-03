#!/usr/bin/env node
'use strict';
const {repoSecurityScan}=require('../lib/collective-brain');const r=repoSecurityScan(process.cwd());console.log(`[COLLECTIVE_BRAIN_SECURITY] ${r.status} findings=${r.findings.length}`);if(r.status!=='PASS')process.exitCode=1;
