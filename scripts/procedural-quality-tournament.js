'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const rd=JSON.parse(fs.readFileSync(path.join(root,'PROCEDURAL_QUALITY_READINESS.json'),'utf8'));
const m=JSON.parse(fs.readFileSync(path.join(root,'PROCEDURAL_QUALITY_DEVICE_MATRIX.json'),'utf8'));
const readiness=Number(rd.architecturalReadinessPct??rd.readinessPct??0);
const candidates=[
{name:'safe',quality:72,stability:99,cost:18},
{name:'balanced',quality:86,stability:97,cost:40},
{name:'high',quality:95,stability:93,cost:65},
{name:'cinematic',quality:99,stability:86,cost:90}
];
for(const x of candidates)x.utility=+(x.quality*.56+x.stability*.34+(100-x.cost)*.10).toFixed(2);
candidates.sort((a,b)=>b.utility-a.utility);
const report={version:10,pass:!!m.pass&&readiness>=98,winner:candidates[0],candidates,deviceMatrixPass:!!m.pass,readiness};
fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_TOURNAMENT.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.pass)process.exit(1);
