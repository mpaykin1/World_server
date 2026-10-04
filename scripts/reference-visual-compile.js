#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {compileReferenceVisual}=require('../lib/reference-visual-compiler');
function usage(){console.error('Usage: node scripts/reference-visual-compile.js <reference.json> [output.json]');}
function main(){const input=process.argv[2],output=process.argv[3];if(!input){usage();process.exitCode=2;return;}
  try{const source=JSON.parse(fs.readFileSync(path.resolve(input),'utf8')),reference=source.normalizedReference||source,result=compileReferenceVisual(reference),json=JSON.stringify(result,null,2)+'\n';
    if(output)fs.writeFileSync(path.resolve(output),json);else process.stdout.write(json);
  }catch(error){console.error('[reference-visual-compile] '+String(error?.message||error));process.exitCode=2;}}
main();
