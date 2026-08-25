#!/usr/bin/env node
'use strict';
const {spawnSync}=require('node:child_process');
function run(cmd,capture=false){const r=spawnSync(cmd,{shell:true,encoding:capture?'utf8':undefined,stdio:capture?undefined:'inherit',env:process.env});if(r.status!==0)throw new Error(`command failed: ${cmd}`);return capture?String(r.stdout||'').trim():'';}
function requireEnv(){for(const k of ['VERCEL_TOKEN','VERCEL_ORG_ID','VERCEL_PROJECT_ID'])if(!process.env[k])throw new Error(`${k} is required`);}
const action=process.argv[2];requireEnv();const token=`--token=${process.env.VERCEL_TOKEN}`;
if(action==='deploy-preview'){run(`npx vercel pull --yes --environment=preview ${token}`);run(`npx vercel build ${token}`);const url=run(`npx vercel deploy --prebuilt ${token}`,true).split(/\r?\n/).filter(Boolean).pop();process.stdout.write(url+'\n');}
else if(action==='promote'){const target=process.argv[3];if(!target)throw new Error('deployment URL/id required');run(`npx vercel promote "${target}" ${token}`);}
else if(action==='rollback'){const target=process.argv[3];run(`npx vercel rollback${target?' "'+target+'"':''} ${token}`);}
else throw new Error('Usage: quality-vercel-provider.js deploy-preview|promote|rollback [deployment]');
