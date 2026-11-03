import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import worker from './worker.mjs';

// Alternate free-host adapter: transport and licensing stay in worker.mjs.
const routes = new Map([
  ['/mcp', '/mcp'],
  ['/health', '/health'],
  ['/meta-games/mcp', '/mcp'],
  ['/meta-games/health', '/health']
]);

export function createMcpServer({ publicOrigin } = {}) {
  const origin = publicOrigin || process.env.RENDER_EXTERNAL_URL || 'http://127.0.0.1';
  const base = new URL(origin);
  return createServer(async (req, res) => {
    try {
      const target = new URL(req.url || '/', base);
      const canonicalPath = routes.get(target.pathname);
      if (!canonicalPath) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      target.pathname = canonicalPath;
      const method = req.method || 'GET';
      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      const opts = { method, headers: req.headers };
      if (hasBody) {
        opts.body = Readable.toWeb(req);
        opts.duplex = 'half';
      }
      const output = await worker.fetch(new Request(target.toString(), opts));
      res.writeHead(output.status, Object.fromEntries(output.headers));
      if (output.body) await pipeline(Readable.fromWeb(output.body), res);
      else res.end();
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  createMcpServer().listen(port, '0.0.0.0', function () {
    console.log('META GAMES MCP listening on port ' + this.address().port);
  });
}
