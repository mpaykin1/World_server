'use strict';
const fs = require('fs');

function collectTests(suites, rows = []) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        rows.push({
          title: spec.title,
          project: test.projectName,
          status: test.status,
          passed: test.status === 'expected'
        });
      }
    }
    collectTests(suite.suites, rows);
  }
  return rows;
}

function summarize(report, sha, threshold = 85) {
  const tests = collectTests(report.suites);
  const passed = tests.filter(test => test.passed).length;
  const percent = tests.length ? Number((passed * 100 / tests.length).toFixed(2)) : 0;
  const profiles = {};
  for (const test of tests) {
    const profile = profiles[test.project] ||= { passed: 0, total: 0, percent: 0 };
    profile.total += 1;
    if (test.passed) profile.passed += 1;
  }
  for (const profile of Object.values(profiles)) {
    profile.percent = Number((profile.passed * 100 / profile.total).toFixed(2));
  }
  return {
    schemaVersion: '1.0.0',
    exactSha: sha,
    thresholdPercent: threshold,
    passed,
    total: tests.length,
    visibilityPercent: percent,
    profiles,
    failures: tests.filter(test => !test.passed),
    ready: tests.length > 0 && percent >= threshold &&
      Object.values(profiles).every(profile => profile.percent >= threshold)
  };
}

if (require.main === module) {
  const input = process.argv[2] || 'golden-world-fleet-evidence.json';
  const output = process.argv[3] || 'golden-world-fleet-evidence-summary.json';
  const sha = process.env.GOLDEN_EXACT_SHA || process.env.GITHUB_SHA || process.env.WORLD_SERVER_DEPLOYED_SHA || 'UNKNOWN';
  const result = summarize(JSON.parse(fs.readFileSync(input, 'utf8')), sha);
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (!result.ready) process.exitCode = 1;
}

module.exports = { collectTests, summarize };
