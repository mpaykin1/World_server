#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const {chooseDependencyUpgrade,rankDependencyCandidates}=require('../lib/quality/dependency-tournament');const file=process.argv[2]||'data/quality-autopilot/dependency-candidates.json';let candidates=[];try{candidates=JSON.parse(fs.readFileSync(file,'utf8')).candidates||[];}catch{}const ranked=rankDependencyCandidates(candidates);console.log(JSON.stringify({winner:chooseDependencyUpgrade(candidates),ranked},null,2));
