import { execFileSync } from 'node:child_process';

// Keep this list aligned with the Render CD path filter.
export const MCP_PATHS = [
  'architecture/meta-games-platform/mcp',
  'architecture/meta-games-platform/catalog.mjs',
  'architecture/meta-games-platform/ASSET_INDEX.json',
  'architecture/meta-games-platform/RIGHTS_REVIEW.json',
  '.github/workflows/meta-games-render-cd.yml'
];

export function expectedDeployedSha(ref = 'HEAD') {
  const sha = execFileSync('git', ['log', '-1', '--format=%H', ref, '--', ...MCP_PATHS], {
    encoding: 'utf8'
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('MCP deployment SHA unavailable; checkout must use fetch-depth: 0');
  return sha;
}
