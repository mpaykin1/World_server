#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process');
const URL='https://github.com/achrefelouafi/LinearAbiltyCastingThreeJS.git';
const PIN='ba61847cb6887e5ccae9cd591e6390082cac5f05';
let repo=process.cwd(); for(let i=2;i<process.argv.length;i++)if(process.argv[i]==='--repo')repo=path.resolve(process.argv[++i]);
const dst=path.join(repo,'vendor','LinearAbiltyCastingThreeJS');
const run=(a,o={})=>cp.execFileSync('git',a,{cwd:o.cwd||repo,stdio:'inherit'});
fs.mkdirSync(path.dirname(dst),{recursive:true});
if(!fs.existsSync(path.join(dst,'.git'))){ run(['clone','--filter=blob:none','--no-checkout',URL,dst]); }
run(['fetch','origin',PIN],{cwd:dst});
run(['sparse-checkout','init','--no-cone'],{cwd:dst});
fs.writeFileSync(path.join(dst,'.git','info','sparse-checkout'),'/src/\n/LICENSE\n/README.md\n/package.json\n/package-lock.json\n/vite.config.js\n!/public/\n');
run(['checkout','--detach',PIN],{cwd:dst});
const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:dst,encoding:'utf8'}).trim();
if(head!==PIN) throw new Error(`Upstream pin mismatch ${head}`);
if(fs.existsSync(path.join(dst,'public'))) throw new Error('public/ unexpectedly present; refusing to keep binary assets');
const lic=fs.readFileSync(path.join(dst,'LICENSE'),'utf8'); if(!/MIT License/i.test(lic)) throw new Error('Expected MIT license text not found; review upstream manually');
console.log(`Pinned upstream source reference ready at ${dst}`);
