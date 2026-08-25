#!/usr/bin/env node
'use strict';
const path=require('node:path');const {verifyAudit}=require('../lib/quality/audit-chain');const r=verifyAudit(path.join(process.cwd(),'data','quality-autopilot','audit-chain.jsonl'));console.log(JSON.stringify(r));if(!r.ok)process.exitCode=2;
