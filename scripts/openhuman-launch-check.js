#!/usr/bin/env node
'use strict';
// OPENHUMAN_GUI_LAUNCH_CHECK + OPENHUMAN_PROVIDER_ROUTING_CHECK
//
// Root cause found this session: OpenHuman.exe returning exit code 0 does NOT mean
// a GUI appeared. It enforces a pre-CEF single-instance mutex (real log line:
// "[single-instance] pre-CEF mutex held by primary; secondary exiting
// (OPENHUMAN-TAURI-A fix)") — a second launch attempt exits almost instantly,
// cleanly, having done nothing. A prior "PASS" based on "the .exe exists and exit
// code was 0" was wrong; this check distinguishes EXECUTABLE_EXISTS from
// GUI_LAUNCH_VERIFIED using the real launch log the World_server AI launcher writes
// (Logs\OpenHuman-launch-latest.log) plus the actual OpenHuman runtime log
// (%USERPROFILE%\.openhuman\logs\openhuman.<date>.log), never assumed.
const fs = require('fs');
const path = require('path');

const LAUNCH_LOG = 'C:\\Users\\user\\Desktop\\World_server AI\\Logs\\OpenHuman-launch-latest.log';
const OPENHUMAN_EXE = 'C:\\Program Files\\OpenHuman\\OpenHuman.exe';
const CONFIG_CANDIDATES_ROOT = path.join(process.env.USERPROFILE || '', '.openhuman', 'users');
const RUNTIME_LOG_DIR = path.join(process.env.USERPROFILE || '', '.openhuman', 'logs');

function checkGuiLaunch() {
  const executableExists = fs.existsSync(OPENHUMAN_EXE);
  if (!fs.existsSync(LAUNCH_LOG)) {
    return { executableExists, guiLaunchVerified: 'NOT_VERIFIED', reason: 'no launch log yet — World_server AI shortcut has never been run (or a launch has never completed)', ageMinutes: null };
  }
  const text = fs.readFileSync(LAUNCH_LOG, 'utf8');
  const ageMinutes = (Date.now() - fs.statSync(LAUNCH_LOG).mtimeMs) / 60000;
  let guiLaunchVerified;
  if (/RESULT: LAUNCHED_OK/.test(text)) guiLaunchVerified = 'PASS';
  else if (/RESULT: BLOCKED_ALREADY_RUNNING/.test(text)) guiLaunchVerified = 'BLOCKED_SINGLE_INSTANCE';
  else if (/RESULT: FAILED/.test(text)) guiLaunchVerified = 'FAIL';
  else if (/RESULT: EXE_NOT_FOUND/.test(text)) guiLaunchVerified = 'FAIL';
  else guiLaunchVerified = 'UNKNOWN';
  return { executableExists, guiLaunchVerified, ageMinutes: Math.round(ageMinutes), lastLog: text.trim().split('\n').slice(-4) };
}

function findConfig() {
  try {
    for (const id of fs.readdirSync(CONFIG_CANDIDATES_ROOT)) {
      const cfg = path.join(CONFIG_CANDIDATES_ROOT, id, 'config.toml');
      if (fs.existsSync(cfg)) return cfg;
    }
  } catch {}
  return null;
}

function checkProviderRouting() {
  const cfgPath = findConfig();
  if (!cfgPath) return { status: 'NOT_FOUND' };
  const text = fs.readFileSync(cfgPath, 'utf8');
  const roles = ['chat_provider', 'reasoning_provider', 'agentic_provider', 'coding_provider', 'vision_provider'];
  const routing = {};
  for (const role of roles) {
    const m = text.match(new RegExp(`^${role}\\s*=\\s*"([^"]*)"`, 'm'));
    routing[role] = m ? m[1] : null;
  }
  const allOpenRouterFree = roles.every((r) => routing[r] === 'openrouter:openrouter/free');
  const providerIds = [...text.matchAll(/slug\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  return { status: allOpenRouterFree ? 'OPENROUTER_FREE_PRIMARY' : 'OTHER', routing, registeredProviders: [...new Set(providerIds)], configPath: cfgPath };
}

function checkRuntimeLogForFailureSignatures() {
  try {
    const files = fs.readdirSync(RUNTIME_LOG_DIR).filter((f) => f.endsWith('.log')).sort();
    const latest = files[files.length - 1];
    if (!latest) return { status: 'NO_LOG' };
    const text = fs.readFileSync(path.join(RUNTIME_LOG_DIR, latest), 'utf8');
    const tail = text.split('\n').slice(-4000).join('\n');
    const signatures = ['panic', 'fatal', 'WebView2', 'single-instance', 'port conflict', 'invalid config'];
    const found = signatures.filter((s) => new RegExp(s, 'i').test(tail));
    return { status: 'OK', file: latest, foundSignatures: found };
  } catch (e) {
    return { status: 'ERROR', error: e.message };
  }
}

function run() {
  const gui = checkGuiLaunch();
  const routing = checkProviderRouting();
  const runtimeLog = checkRuntimeLogForFailureSignatures();
  const report = {
    test: 'OPENHUMAN_GUI_LAUNCH_CHECK + OPENHUMAN_PROVIDER_ROUTING_CHECK',
    generatedAt: new Date().toISOString(),
    gui,
    routing,
    runtimeLog,
    note: 'executableExists=true and exit code 0 do NOT imply guiLaunchVerified=PASS — OpenHuman\'s single-instance mutex makes a second launch exit cleanly having done nothing. Only RESULT: LAUNCHED_OK in the launch log (a real PID with a non-zero MainWindowHandle) counts as PASS.',
  };
  fs.writeFileSync(path.join(__dirname, '..', 'OPENHUMAN_LAUNCH_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  const r = run();
  console.log(`[OPENHUMAN_LAUNCH_CHECK] executableExists=${r.gui.executableExists} guiLaunchVerified=${r.gui.guiLaunchVerified} routing=${r.routing.status}`);
}

module.exports = { run };
