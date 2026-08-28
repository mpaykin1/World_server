#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=process.cwd(),bin=process.platform==='win32'?path.join(root,'tools/game-motion/node/node_modules/.bin/gltf-transform.cmd'):path.join(root,'tools/game-motion/node/node_modules/.bin/gltf-transform');
if(!fs.existsSync(bin)){console.error('[GLTF_TOOLCHECK] missing glTF-Transform; run animation:oss:bootstrap');process.exit(1)}
const r=spawnSync(bin,['--version'],{encoding:'utf8'});console.log(`[GLTF_TOOLCHECK] ${String(r.stdout||r.stderr).trim()}`);if(r.status!==0)process.exitCode=1;
