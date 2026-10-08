#!/usr/bin/env node
'use strict';

const { buildSzhContext, buildSzhPrompt } = require('../lib/szh-writing-system');

const args = process.argv.slice(2);
const promptMode = args.includes('--prompt');
const requestIndex = args.indexOf('--request');
const request = requestIndex >= 0 ? (args[requestIndex + 1] || '') : '';
const styleIndex = args.indexOf('--style');
const currentStyleInstruction = styleIndex >= 0 ? (args[styleIndex + 1] || '') : '';
const editIndex = args.indexOf('--user-edit');
const latestUserEdit = editIndex >= 0 ? (args[editIndex + 1] || '') : '';

const options = {
  request,
  currentStyleInstruction,
  latestUserEdit,
  personalAuthoredText: !args.includes('--not-personal')
};

if (promptMode) {
  process.stdout.write(buildSzhPrompt(options) + '\n');
} else {
  process.stdout.write(JSON.stringify(buildSzhContext(options), null, 2) + '\n');
}
