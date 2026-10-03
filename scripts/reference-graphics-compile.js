#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {compileReferenceRecipe}=require('../lib/reference-recipe-compiler');
const {planReferenceCorrections}=require('../lib/reference-correction-planner');

function readJson(file){
  return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
}
function normalizeFrames(frames){
  if(!Array.isArray(frames))return frames;
  return frames.map(frame=>({...frame,pixels:frame?.pixels instanceof Uint8Array?frame.pixels:Uint8Array.from(frame?.pixels||[])}));
}
function main(){
  const inputPath=process.argv[2],outputPath=process.argv[3];
  if(!inputPath){
    console.error('Usage: node scripts/reference-graphics-compile.js <input.json> [output.json]');
    process.exit(2);
  }
  const input=readJson(inputPath);
  const recipe=compileReferenceRecipe({...input,frames:normalizeFrames(input.frames)});
  const result={recipe};
  if(input.runtimeGrammar)result.corrections=planReferenceCorrections(recipe.grammar,input.runtimeGrammar,input.fidelity||{});
  const json=JSON.stringify(result,null,2)+'\n';
  if(outputPath)fs.writeFileSync(path.resolve(outputPath),json);
  else process.stdout.write(json);
}
main();
