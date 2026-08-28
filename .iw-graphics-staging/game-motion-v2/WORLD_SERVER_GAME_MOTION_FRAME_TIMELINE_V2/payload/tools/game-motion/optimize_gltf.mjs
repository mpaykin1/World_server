#!/usr/bin/env node
import {spawnSync} from 'node:child_process';import path from 'node:path';import fs from 'node:fs';
const [input,output]=process.argv.slice(2);if(!input||!output){console.error('Usage: node tools/game-motion/optimize_gltf.mjs input.glb output.glb');process.exit(2)}
const root=process.cwd(),bin=process.platform==='win32'?path.join(root,'tools/game-motion/node/node_modules/.bin/gltf-transform.cmd'):path.join(root,'tools/game-motion/node/node_modules/.bin/gltf-transform');
if(!fs.existsSync(bin)){console.error('glTF-Transform not installed. Run npm run animation:oss:bootstrap');process.exit(1)}
const before=fs.statSync(input).size;
const r=spawnSync(bin,['meshopt',input,output,'--level','medium'],{stdio:'inherit',shell:false});
if(r.status!==0)process.exit(r.status??1);
const after=fs.statSync(output).size;
console.log(`[optimize_gltf] PASS before=${before} after=${after} saved=${Math.max(0,100-after/before*100).toFixed(1)}%`);
