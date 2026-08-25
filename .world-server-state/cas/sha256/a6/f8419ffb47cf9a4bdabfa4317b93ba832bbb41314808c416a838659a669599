#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd();
const MIGR_DIR=path.join(ROOT,'supabase','migrations');
const EXPECTED_COUNT=108;
const EXPECTED_DIGEST='6775a559063525b6dfb9ef61181c7eb83c1a05fe5eea6e2180c83ea6185a5363';
const EXPECTED_LATEST='20260824060624_unified_autonomous_game_factory_v1_hardening.sql';

function fail(msg){ console.error('[MIGRATION_GUARD] FAIL',msg); process.exit(1); }

if(!fs.existsSync(MIGR_DIR)) fail('migrations dir missing: '+MIGR_DIR);
const files=fs.readdirSync(MIGR_DIR).filter(f=>f.endsWith('.sql')).sort();
if(files.length!==EXPECTED_COUNT) fail(`count ${files.length} != ${EXPECTED_COUNT} (drift). Run restore from production export.`);
const joined=files.join('\n');
const digest=crypto.createHash('sha256').update(joined,'utf8').digest('hex');
if(digest!==EXPECTED_DIGEST) fail(`digest ${digest} != ${EXPECTED_DIGEST}`);
if(files[files.length-1]!==EXPECTED_LATEST) fail(`latest ${files[files.length-1]} != ${EXPECTED_LATEST}`);
console.log(`[MIGRATION_GUARD] PASS ${files.length} migrations digest ${digest} latest ${EXPECTED_LATEST}`);
