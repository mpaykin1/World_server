import worker from '../../architecture/meta-games-platform/mcp/worker.mjs';

export const config = { path: '/meta-games/health' };
export default async function handler(request) {
  const target = new URL(request.url);
  target.pathname = '/health';
  return worker.fetch(new Request(target.toString(), request));
}
