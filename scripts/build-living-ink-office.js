#!/usr/bin/env node
'use strict';
const path=require('path');
const {buildFromRepo}=require('../lib/living-ink-compiler');
const result=buildFromRepo(path.resolve(__dirname,'..'));
console.log(`Living Ink standalone built: ${result.out} (${result.bytes} bytes, seed ${result.recipe.seed})`);
