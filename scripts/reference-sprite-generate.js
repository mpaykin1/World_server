#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {generateSpriteAtlas}=require('../lib/reference-sprite-generator');
const {png}=require('./world-sprite-cpu');

const input=process.argv[2],output=process.argv[3];
if(!input||!output){
  console.error('Usage: node scripts/reference-sprite-generate.js <spec.json> <output.png>');
  process.exit(2);
}
const spec=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
const atlas=generateSpriteAtlas(spec,spec.poses||[]);
fs.writeFileSync(path.resolve(output),png(atlas.width,atlas.height,Buffer.from(atlas.pixels)));
process.stdout.write(JSON.stringify({
  output:path.resolve(output),width:atlas.width,height:atlas.height,
  frameWidth:atlas.frameWidth,frameHeight:atlas.frameHeight,frames:atlas.frames
})+'\n');
