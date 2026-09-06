#!/usr/bin/env node
'use strict';
const {exportSnapshot}=require('../lib/collective-brain');const r=exportSnapshot(process.cwd());console.log(`[COLLECTIVE_BRAIN_EXPORT] ${r.hash} -> ${r.json}`);
