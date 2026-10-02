#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function desktopCandidates(home = os.homedir()) {
  const out = [path.join(home, 'Desktop')];
  if (process.env.OneDrive) out.push(path.join(process.env.OneDrive, 'Desktop'));
  return [...new Set(out.map((p) => path.resolve(p)))];
}

function classifyOutput(target, opts = {}) {
  const home = path.resolve(opts.home || os.homedir());
  const resolved = path.resolve(target);
  const desktops = opts.desktops || desktopCandidates(home);
  const approvedRoots = (opts.approvedRoots || []).map((p) => path.resolve(p));
  const approved = approvedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  const forbidden = !approved && (resolved === home || desktops.some((d) => resolved === d || resolved.startsWith(d + path.sep)));
  return { resolved, forbidden, approved };
}

function assertSafeOutput(target, opts = {}) {
  const result = classifyOutput(target, opts);
  if (result.forbidden && !opts.explicitUserDestination) {
    throw new Error('WORKSPACE_HYGIENE_BLOCKED: ' + result.resolved);
  }
  return result.resolved;
}

function scanDesktopDelta(before, after) {
  const base = new Set(before);
  return after.filter((name) => !base.has(name));
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node scripts/workspace-hygiene.js <output-path>');
    process.exit(2);
  }
  try { console.log(assertSafeOutput(target)); }
  catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { desktopCandidates, classifyOutput, assertSafeOutput, scanDesktopDelta };
