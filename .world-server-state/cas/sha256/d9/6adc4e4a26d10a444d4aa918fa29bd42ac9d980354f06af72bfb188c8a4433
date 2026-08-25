'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const critic=JSON.parse(fs.readFileSync(path.join(root,'PROCEDURAL_QUALITY_CRITIC.json'),'utf8'));
const tour=JSON.parse(fs.readFileSync(path.join(root,'PROCEDURAL_QUALITY_TOURNAMENT.json'),'utf8'));
const rollback=!(critic.pass&&tour.pass);
const report={version:10,rollback,reason:rollback?'quality gate failed':'all V10 package gates passed'};
fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_ROLLBACK.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(rollback)process.exit(1);
