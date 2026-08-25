'use strict';
// LHCI config for GitHub Actions (ubuntu-latest).
// Uses installed @lhci/cli 0.15.1. Server is started via a cross-platform
// Node entry without shell quotes (see scripts/lhci-start-server.cjs) on port 3100.
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3100/apps/ai3d-voxel-city/',
        'http://localhost:3100/apps/catalog/',
        'http://localhost:3100/apps/voxel-world/',
      ],
      // Cross-platform, no shell env prefix like "PORT=3100 node server.js" and no quotes.
      // The helper script sets process.env.PORT=3100 internally and requires server.js.
      startServerCommand: 'node scripts/lhci-start-server.cjs',
      startServerReadyPattern: 'World Server local development',
      startServerReadyTimeout: 30000,
      numberOfRuns: 1,
      settings: {
        // Keep CI chrome stable on ubuntu-latest runners
        chromeFlags: '--no-sandbox --headless',
        // Do not throttle too aggressively; we only need reports artifact
        maxWaitForLoad: 45000,
      },
    },
    assert: {
      // Do not fail CI on Lighthouse scores; we only collect and upload.
      // Using warn with minScore 0 ensures PASS while still producing assertions.
      assertions: {
        'categories:performance': ['warn', { minScore: 0 }],
        'categories:accessibility': ['warn', { minScore: 0 }],
        'categories:best-practices': ['warn', { minScore: 0 }],
        'categories:seo': ['warn', { minScore: 0 }],
      },
    },
    upload: {
      // Keep reports locally and let GitHub Actions upload as artifact.
      // No LHCI server token needed; temporary-public-storage would require network.
      target: 'filesystem',
      outputDir: './.lighthouseci',
    },
  },
};
