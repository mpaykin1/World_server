'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Vercel's Hobby plan (the plan this project currently deploys on) rejects any
// deployment with more than 12 Serverless Functions:
// https://vercel.link/function-count-limit
// This has already broken real deployments once (errorCode
// exceeded_serverless_functions_per_deployment) because api/*.js grew to 38
// files. Route handlers now live in lib/api-handlers/ and are dispatched
// through a handful of router files in api/ (see api/quality.js, api/auth.js,
// api/generative.js + the matching vercel.json rewrites). This guard keeps a
// safety margin under the hard limit so that never happens silently again.
const API_DIR = path.join(__dirname, '..', 'api');
const HOBBY_PLAN_FUNCTION_LIMIT = 12;
const SAFE_MAX_FUNCTIONS = 10;

test('api/ stays well under the Vercel Hobby plan serverless function limit', () => {
  const files = fs.readdirSync(API_DIR).filter(f => f.endsWith('.js'));
  assert.ok(
    files.length <= SAFE_MAX_FUNCTIONS,
    `api/ has ${files.length} function files (hard Vercel Hobby limit is ${HOBBY_PLAN_FUNCTION_LIMIT}). ` +
    `Add new endpoints as routes inside an existing router (api/quality.js, api/auth.js, api/generative.js) ` +
    `with a lib/api-handlers/ module + vercel.json rewrite, instead of a new file under api/. Files: ${files.join(', ')}`
  );
});
