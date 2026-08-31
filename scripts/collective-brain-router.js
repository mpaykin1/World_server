#!/usr/bin/env node
'use strict';
const {routeTask}=require('../lib/collective-brain');const task=process.argv.slice(2).join(' ').replace(/^--\s*/,'');const r=routeTask(process.cwd(),task);console.log(`[COLLECTIVE_BRAIN_ROUTE] primary=${r.primary?.id||'none'} secondary=${r.secondary?.id||'none'} peerReview=${r.peerReviewRequired}`);
