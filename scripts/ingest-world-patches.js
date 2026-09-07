'use strict';

const fs = require('fs');
const path = require('path');
const { ingestManifests } = require('../lib/world-graph');

const root = path.resolve(__dirname, '..');
const manifestDir = path.join(root, 'data', 'world-manifests');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'app-release-registry.json'), 'utf8'));
const manifests = fs.readdirSync(manifestDir).filter((name) => name.endsWith('.json')).sort().map((name) => JSON.parse(fs.readFileSync(path.join(manifestDir, name), 'utf8')));
const index = ingestManifests(manifests, registry);
fs.writeFileSync(path.join(root, 'data', 'world-graph-index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`[WORLD_GRAPH_INGEST] worlds=${index.worlds.length} revisions=${index.worlds.reduce((n, w) => n + w.revisions.length, 0)} public=${index.worlds.filter((w) => w.public).length}`);
