#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {build} from 'esbuild';
const root=process.cwd(),out=path.join(root,'shared/vendor');
const cp=(a,b)=>{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)};const cpdir=(a,b)=>{fs.cpSync(a,b,{recursive:true,force:true})};
const need=p=>{if(!fs.existsSync(p))throw new Error(`Missing ${p}. Run npm install first.`);return p};
fs.mkdirSync(out,{recursive:true});const three=need(path.join(root,'node_modules/three'));
for(const f of ['three.module.js','three.core.js','three.webgpu.js','three.tsl.js'])cp(need(path.join(three,'build',f)),path.join(out,'three',f));
cpdir(need(path.join(three,'examples/jsm')),path.join(out,'three/examples/jsm'));
await build({stdin:{contents:`import * as RAPIER from '@dimforge/rapier3d-compat';export {RAPIER};export default RAPIER;`,resolveDir:root,sourcefile:'rapier-entry.mjs'},bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:path.join(out,'rapier/rapier.bundle.mjs'),minify:true,legalComments:'none'});
await build({stdin:{contents:`export {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';`,resolveDir:root,sourcefile:'meshopt-entry.mjs'},bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:path.join(out,'meshoptimizer/meshoptimizer.bundle.mjs'),minify:true,legalComments:'none'});
const report={schemaVersion:'2.0.0',generatedAt:new Date().toISOString(),three:'0.185.1',rapier:'0.20.0',meshoptimizer:'1.2.0',files:['shared/vendor/three/three.module.js','shared/vendor/three/three.core.js','shared/vendor/three/three.webgpu.js','shared/vendor/three/three.tsl.js','shared/vendor/three/examples/jsm/loaders/KTX2Loader.js','shared/vendor/three/examples/jsm/libs/basis/basis_transcoder.wasm','shared/vendor/rapier/rapier.bundle.mjs','shared/vendor/meshoptimizer/meshoptimizer.bundle.mjs']};
for(const f of report.files)if(!fs.existsSync(path.join(root,f)))throw new Error(`Vendor output missing: ${f}`);fs.writeFileSync(path.join(root,'GRAPHICS_VENDOR_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log('[graphics:vendor] PASS');
