#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),id=process.argv[2];
if(!id)throw new Error('candidate id required');
if(process.env.AUTOFIX_RECIPE_APPROVED!=='YES')throw new Error('AUTOFIX_RECIPE_APPROVED=YES required');
const lp=path.join(ROOT,'data/autofix-learning.json'),rp=path.join(ROOT,'data/autofix-recipes.json');
const l=JSON.parse(fs.readFileSync(lp,'utf8')),r=JSON.parse(fs.readFileSync(rp,'utf8'));
const c=(l.candidates||[]).find(x=>x.id===id);
if(!c)throw new Error('candidate not found');
if(!c.from||c.from.length>1200||c.to.length>1200)throw new Error('unsafe candidate');
r.recipes=r.recipes||[];
if(!r.recipes.some(x=>x.id===id))r.recipes.push({id,kind:'replaceAll',glob:['apps/**/*.js','shared/**/*.js','e2e/**/*.js','test/**/*.js'],from:c.from,to:c.to,risk:'learned-confirmed'});
l.candidates=l.candidates.filter(x=>x.id!==id);
l.promoted=l.promoted||[];l.promoted.push({...c,status:'promoted',promotedAt:new Date().toISOString()});
fs.writeFileSync(rp,JSON.stringify(r,null,2)+'\n');fs.writeFileSync(lp,JSON.stringify(l,null,2)+'\n');
console.log(`[AUTOFIX_LEARNING] promoted ${id}`);
