export async function runLegacy(request, handler) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  let statusCode = 200;
  let responseBody = '';
  const responseHeaders = new Headers();
  const req = {
    method: request.method,
    headers,
    body,
    query: Object.fromEntries(url.searchParams.entries()),
    url: url.pathname + url.search
  };
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = Number(value) || 200; },
    setHeader(name, value) {
      if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, String(item));
      else responseHeaders.set(name, String(value));
    },
    end(value) {
      if (value === undefined || value === null) responseBody = '';
      else if (Buffer.isBuffer(value)) responseBody = value.toString('utf8');
      else responseBody = String(value);
    }
  };
  await handler(req, res);
  return new Response(responseBody, { status: statusCode, headers: responseHeaders });
}
