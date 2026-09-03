#!/usr/bin/env node
'use strict';
const {recall}=require('../lib/collective-brain');
const q=process.argv.slice(2).join(' ').replace(/^--\s*/, '');
recall(process.cwd(),q).then(r=>console.log(`[COLLECTIVE_BRAIN_RECALL] mode=${r.mode} results=${r.resultCount}`)).catch(e=>{console.error(e);process.exitCode=1;});
