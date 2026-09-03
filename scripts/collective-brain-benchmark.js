#!/usr/bin/env node
'use strict';
const {benchmark}=require('../lib/collective-brain');const r=benchmark(process.cwd());console.log(`[COLLECTIVE_BRAIN_BENCHMARK] ${r.status} ${r.durationMs}ms primary=${r.routePrimary}`);
