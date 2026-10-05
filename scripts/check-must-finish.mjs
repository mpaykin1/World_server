import fs from 'node:fs';

const file=new URL('../data/must-finish.json',import.meta.url);
const data=JSON.parse(fs.readFileSync(file,'utf8'));

const errors=[];
if(data.name!=='MF')errors.push('name must be MF');
if(data.displayName!=='Must Finish')errors.push('displayName must be Must Finish');
if(!Array.isArray(data.projects)||data.projects.length===0)errors.push('projects must be a non-empty array');

const ids=new Set();
for(const [index,project] of (data.projects||[]).entries()){
  const prefix=`projects[${index}]`;
  if(!project?.id)errors.push(`${prefix}.id required`);
  else if(ids.has(project.id))errors.push(`duplicate project id: ${project.id}`);
  else ids.add(project.id);
  if(!project?.title)errors.push(`${prefix}.title required`);
  if(project?.priority!=='must-finish')errors.push(`${prefix}.priority must be must-finish`);
  if(!['in-progress','blocked','done'].includes(project?.mfStatus))errors.push(`${prefix}.mfStatus invalid`);
  if(!project?.canonical?.appPath)errors.push(`${prefix}.canonical.appPath required`);
  if(!project?.canonical?.handoff)errors.push(`${prefix}.canonical.handoff required`);
  if(!project?.completionCriteria||typeof project.completionCriteria!=='object')errors.push(`${prefix}.completionCriteria required`);
  if(project?.mfStatus==='done'){
    const incomplete=Object.entries(project.completionCriteria||{}).filter(([,value])=>value!==true).map(([key])=>key);
    if(incomplete.length)errors.push(`${prefix} cannot be done; incomplete criteria: ${incomplete.join(', ')}`);
  }
}
if(data?.policy?.removalRequiresUserApproval!==true)errors.push('policy.removalRequiresUserApproval must be true');
if(data?.policy?.notAutomation!==true)errors.push('policy.notAutomation must be true');

if(errors.length){
  console.error('[MF_CHECK] FAIL');
  for(const error of errors)console.error('-',error);
  process.exit(1);
}
console.log(`[MF_CHECK] PASS: ${data.projects.length} must-finish project(s)`);
