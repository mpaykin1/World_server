import worker from '../../architecture/meta-games-platform/mcp/worker.mjs';

// Netlify's existing site; same audited transport and licensing rules.
export const config = { path: '/meta-games/mcp' };
export default async function handler(request) {
  const target = new URL(request.url);
  target.pathname = '/mcp';
  return worker.fetch(new Request(target.toString(), request));
}
