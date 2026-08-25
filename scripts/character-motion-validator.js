#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/character-motion-contract.json'), 'utf8'));
const inputArg = process.argv.find(x => x.startsWith('--input='));
const input = inputArg ? inputArg.slice('--input='.length) : process.env.CHARACTER_TELEMETRY_JSON;
const requireTelemetry = process.argv.includes('--require');
const reportPath = path.join(ROOT, 'CHARACTER_MOTION_REPORT.json');

const dot2 = (a, b) => Number(a?.x || 0) * Number(b?.x || 0) + Number(a?.z || 0) * Number(b?.z || 0);
const mag2 = a => Math.hypot(Number(a?.x || 0), Number(a?.z || 0));
const alignment = (a, b) => {
  const den = mag2(a) * mag2(b);
  return den > 1e-9 ? dot2(a, b) / den : 1;
};

function finish(report, code = 0) {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[CHARACTER_MOTION] ${report.status} score=${report.score ?? 0}`);
  process.exitCode = code;
}

if (!input || !fs.existsSync(path.resolve(ROOT, input))) {
  finish({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'NOT_VERIFIED',
    score: 0,
    reason: 'No character telemetry supplied. Set CHARACTER_TELEMETRY_JSON or --input=<file>.',
    requiredProducer: 'runtime character telemetry exporter'
  }, requireTelemetry ? 31 : 0);
} else {
  const telemetry = JSON.parse(fs.readFileSync(path.resolve(ROOT, input), 'utf8'));
  const frames = Array.isArray(telemetry.frames) ? telemetry.frames : [];
  const violations = [];
  let checks = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const speed = mag2(f.velocity);
    if (speed >= contract.thresholds.movementSpeedMin) {
      checks++;
      const a = alignment(f.feetForward, f.velocity);
      if (a < contract.thresholds.feetMovementAlignmentMin) {
        violations.push({ frame: i, rule: 'feet-follow-movement', alignment: a });
      }
    }
    if (f.attack?.type === 'sword') {
      checks++;
      const a = alignment(f.feetForward, f.attack.direction);
      if (a < contract.thresholds.swordFeetAlignmentMin) {
        violations.push({ frame: i, rule: 'sword-follows-feet', alignment: a });
      }
    }
    if (f.shield?.active) {
      checks += 3;
      if (f.shield.vertical !== true) violations.push({ frame: i, rule: 'shield-vertical' });
      if (Number(f.shield.torsoCoverage || 0) < contract.thresholds.shieldTorsoCoverageMin) {
        violations.push({ frame: i, rule: 'shield-torso-coverage', value: f.shield.torsoCoverage });
      }
      const front = alignment(f.shield.fromTorso, f.enemyDirection);
      if (front < contract.thresholds.shieldEnemyAlignmentMin) {
        violations.push({ frame: i, rule: 'shield-between-enemy-and-torso', alignment: front });
      }
    }
    if (f.weapon?.type === 'pistol') {
      checks++;
      if (f.weapon.inPrimaryHand !== true) violations.push({ frame: i, rule: 'pistol-in-hand' });
    }
    if (['rifle', 'automatic', 'machinegun'].includes(f.weapon?.type)) {
      checks++;
      if (Number(f.weapon.gripCount || 0) < 2) violations.push({ frame: i, rule: 'long-gun-two-hands' });
    }
    if (Number.isFinite(f.footSlideMeters)) {
      checks++;
      if (f.footSlideMeters > contract.thresholds.footSlideMetersMax) {
        violations.push({ frame: i, rule: 'foot-slide', value: f.footSlideMeters });
      }
    }
  }

  const score = checks ? Math.max(0, Math.round(100 * (1 - violations.length / checks))) : 0;
  finish({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: frames.length && violations.length === 0 ? 'PASS' : frames.length ? 'FAIL' : 'NOT_VERIFIED',
    score,
    frames: frames.length,
    checks,
    violations
  }, requireTelemetry && (!frames.length || violations.length) ? 31 : 0);
}
