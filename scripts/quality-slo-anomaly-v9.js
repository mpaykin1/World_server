#!/usr/bin/env node
'use strict';const fs=require('node:fs');const {detectAnomalies}=require('../lib/quality/slo-anomaly-v9');const b=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),c=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));const r=detectAnomalies(b,c);console.log(JSON.stringify(r,null,2));if(!r.ok)process.exit(1);
