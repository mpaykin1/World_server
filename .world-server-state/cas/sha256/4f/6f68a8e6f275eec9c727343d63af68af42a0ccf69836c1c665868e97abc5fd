'use strict';

const crypto = require('node:crypto');
function norm(s) { return String(s || '').toLowerCase().replace(/\b\d+\b/g, '#').replace(/[a-f0-9]{8,}/g, '<id>').replace(/\s+/g, ' ').trim().slice(0, 300); }
function fingerprint(event) { return crypto.createHash('sha1').update([event.kind || 'error', norm(event.message || event.signature), event.source || ''].join('|')).digest('hex').slice(0, 16); }
function clusterFailures(events = []) {
  const map = new Map();
  for (const event of events) {
    const id = fingerprint(event);
    if (!map.has(id)) map.set(id, { id, kind: event.kind || 'error', normalized: norm(event.message || event.signature), count: 0, projects: new Set(), examples: [] });
    const c = map.get(id); c.count++; if (event.projectId) c.projects.add(event.projectId); if (c.examples.length < 3) c.examples.push(event);
  }
  return [...map.values()].map(c => ({ ...c, projects: [...c.projects] })).sort((a, b) => b.count - a.count);
}
module.exports = { clusterFailures, fingerprint };
