#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  const ROOT = process.cwd();
  const url = process.env.QUALITY_VISUAL_CRITIC_URL;
  const token = process.env.QUALITY_VISUAL_CRITIC_TOKEN;
  const imgs = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) imgs.push(absolute);
    }
  }

  walk(path.join(ROOT, 'visual-candidates'));

  const policyPath = path.join(ROOT, 'data/self-improvement-policy.json');
  const policy = fs.existsSync(policyPath)
    ? JSON.parse(fs.readFileSync(policyPath, 'utf8'))
    : null;

  const out = {
    generatedAt: new Date().toISOString(),
    status: url ? 'REVIEWED' : 'NOT_CONFIGURED',
    reviews: []
  };

  if (url) {
    for (const img of imgs.slice(0, 20)) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            imageBase64: fs.readFileSync(img).toString('base64'),
            instruction: 'Return JSON findings only. Never self-approve. Find concrete visual regressions and quality improvements while preserving certified detail.',
            visualRules: policy?.visualRules || [],
            animationRules: policy?.animationRules || []
          }),
          signal: AbortSignal.timeout(120000)
        });
        out.reviews.push({
          file: path.relative(ROOT, img).replaceAll('\\', '/'),
          ok: response.ok,
          result: await response.json()
        });
      } catch (error) {
        out.reviews.push({
          file: path.relative(ROOT, img).replaceAll('\\', '/'),
          ok: false,
          error: String(error.message || error)
        });
      }
    }
  }

  fs.writeFileSync(path.join(ROOT, 'AI_VISUAL_CRITIC_REPORT.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`[AI_VISUAL_CRITIC] ${out.status} reviews=${out.reviews.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
