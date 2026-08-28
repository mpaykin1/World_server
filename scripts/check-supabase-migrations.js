#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd();
const MIGR_DIR=path.join(ROOT,'supabase','migrations');
const EXPECTED_COUNT=110;
const EXPECTED_DIGEST='36bdee3ba6de92a5b277da9c94cf03259534603b94db1b5890b0555a14204ede';
const EXPECTED_LATEST='20260826140000_ai_supervisor_control_plane.sql';

function fail(msg){ console.error('[MIGRATION_GUARD] FAIL',msg); process.exit(1); }

if(!fs.existsSync(MIGR_DIR)) fail('migrations dir missing: '+MIGR_DIR);
const files=fs.readdirSync(MIGR_DIR).filter(f=>f.endsWith('.sql')).sort();
if(files.length!==EXPECTED_COUNT) fail(`count ${files.length} != ${EXPECTED_COUNT} (drift). Run restore from production export.`);
const joined=files.join('\n');
const digest=crypto.createHash('sha256').update(joined,'utf8').digest('hex');
if(digest!==EXPECTED_DIGEST) fail(`digest ${digest} != ${EXPECTED_DIGEST}`);
if(files[files.length-1]!==EXPECTED_LATEST) fail(`latest ${files[files.length-1]} != ${EXPECTED_LATEST}`);
console.log(`[MIGRATION_GUARD] PASS ${files.length} migrations digest ${digest} latest ${EXPECTED_LATEST}`);
