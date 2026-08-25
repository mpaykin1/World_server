#!/usr/bin/env node
'use strict';const fs=require('node:fs');const {gateNearFieldQuality}=require('../lib/quality/near-field-quality-gate-v9');const before=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),after=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));const r=gateNearFieldQuality(before,after);console.log(JSON.stringify(r,null,2));if(!r.ok)process.exit(1);
