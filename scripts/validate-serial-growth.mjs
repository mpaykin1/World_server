import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const enginePath = path.join(root, '.ai', 'aka-serial-growth-engine.json');
const statePath = path.join(root, 'data', 'serial-growth-state.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(`SERIAL_GROWTH_FAIL: ${message}`);
  process.exitCode = 1;
}

const engine = readJson(enginePath);
const state = readJson(statePath);

if (!engine.enabled) fail('engine must be enabled');
if (engine.cadence !== 'hourly') fail('cadence must stay hourly');
if (!engine.truthPolicy?.realCapabilityOnly || !engine.truthPolicy?.claimRequiresEvidence) {
  fail('truth policy must require real capabilities and evidence');
}

const requiredBeats = new Set(engine.episodeContract?.requiredBeats ?? []);
for (const beat of ['hook', 'world_or_capability_reveal', 'cliffhanger', 'enter_world_cta']) {
  if (!requiredBeats.has(beat)) fail(`required episode beat missing: ${beat}`);
}

if ((engine.qualityGates?.userNoticeabilityPercentForTestingLink ?? 0) < 85) {
  fail('testing-link noticeability gate must be at least 85%');
}

if (!state.rules?.keepOneContinuousStory) fail('continuity must remain enabled');
if (!state.rules?.realServerEvidenceRequired) fail('server evidence must remain required');
if (!Array.isArray(state.episodeHistory)) fail('episodeHistory must be an array');
if (!Array.isArray(state.backlog)) fail('backlog must be an array');

const episode = state.currentEpisode;
if (episode) {
  for (const field of ['number', 'hook', 'heroGoal', 'obstacle', 'worldOrCapability', 'cliffhanger', 'enterWorldCTA', 'evidence']) {
    if (episode[field] === undefined || episode[field] === null || episode[field] === '') {
      fail(`currentEpisode.${field} is required`);
    }
  }
  if (!Array.isArray(episode.shortIdeas) || episode.shortIdeas.length < 5 || episode.shortIdeas.length > 15) {
    fail('currentEpisode.shortIdeas must contain 5-15 ideas');
  }
  if (!episode.evidence?.verified) fail('currentEpisode evidence must be verified');
}

if (!process.exitCode) {
  console.log('SERIAL_GROWTH_PASS');
}
