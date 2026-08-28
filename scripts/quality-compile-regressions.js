#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {compileRegressionTests}=require('../lib/quality/error-to-regression');
const f=process.argv[2]||path.join('data','quality-autopilot','production-errors.json');const data=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{events:[]};const r=compileRegressionTests(process.cwd(),data.events||[]);console.log(`[QUALITY_REGRESSION_COMPILER] cases=${r.cases} file=${r.file}`);
