#!/usr/bin/env node
'use strict';
const fs=require('fs');const {structuralCheck}=require('../lib/collective-brain');const r=structuralCheck(process.cwd());fs.writeFileSync('COLLECTIVE_BRAIN_CHECK.json',JSON.stringify(r,null,2)+'\n');console.log(`[COLLECTIVE_BRAIN_CHECK] ${r.status}`);if(r.errors.length)console.error(r.errors.join('\n'));process.exitCode=r.status==='PASS'?0:1;
