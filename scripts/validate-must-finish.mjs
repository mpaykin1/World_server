#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const registry=JSON.parse(read('data/must-finish.json'));
const mf=read('MF.md');
const start=read('AI_START_HERE.md');
const index=JSON.parse(read('.ai/project-context-index.json'));
const errors=[];

if(registry.name!=='MF')errors.push('registry.name must be MF');
if(!Array.isArray(registry.projects)||registry.projects.length===0)errors.push('projects must be non-empty');
const ids=new Set();
for(const project of registry.projects||[]){
  if(!project?.id)errors.push('project id missing');
  else if(ids.has(project.id))errors.push(`duplicate project id: ${project.id}`);
  else ids.add(project.id);
  if(project.mfStatus!=='in-progress'&&project.mfStatus!=='done')errors.push(`invalid mfStatus: ${project.id}`);
  if(project.priority!=='must-finish')errors.push(`priority must be must-finish: ${project.id}`);
  if(!project.canonical?.handoff)errors.push(`handoff missing: ${project.id}`);
  else if(!fs.existsSync(path.join(root,project.canonical.handoff)))errors.push(`handoff file missing: ${project.canonical.handoff}`);
  if(!project.completionCriteria||typeof project.completionCriteria!=='object')errors.push(`completionCriteria missing: ${project.id}`);
  if(!mf.includes(project.id))errors.push(`MF.md does not mention: ${project.id}`);
}
if(!start.includes('MF.md')||!start.includes('data/must-finish.json'))errors.push('AI_START_HERE does not bootstrap MF');
const canonical=index.canonicalContextFiles||[];
if(!canonical.includes('MF.md')||!canonical.includes('data/must-finish.json'))errors.push('project context index does not include MF canonical files');
if(index.concepts?.mustFinish?.canonicalFile!=='MF.md')errors.push('mustFinish concept missing from project context index');

if(errors.length){
  console.error('[MF_CHECK] FAIL');
  for(const error of errors)console.error(' - '+error);
  process.exit(1);
}
console.log(`[MF_CHECK] PASS projects=${registry.projects.length} ids=${[...ids].join(',')}`);
