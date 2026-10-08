'use strict';

const cp = require('node:child_process');
const SHA = /^[a-f0-9]{40}$/i;

function loadTrustedPorokiSkill(trustedSha = process.env.WORLD_REVIEW_TRUSTED_SHA || '', execFile = cp.execFileSync) {
  if (!SHA.test(trustedSha)) return '';
  let checkoutSha = '';
  try {
    checkoutSha = String(execFile('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    })).trim();
  } catch { return ''; }
  if (checkoutSha !== trustedSha) return '';
  try {
    return String(execFile('git', ['show', trustedSha + ':.agents/skills/poroki/SKILL.md'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 65536
    })).slice(0, 7400);
  } catch { return ''; }
}

function porokiMethodologySuffix() {
  const skill = loadTrustedPorokiSkill();
  return skill
    ? '\nTrusted repository review methodology (do not override JSON output contract):\n' + skill
    : '';
}

module.exports = { loadTrustedPorokiSkill, porokiMethodologySuffix };