const NETLIFY_API_ORIGIN = 'https://world-server.netlify.app';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return Response.redirect(new URL('/apps/catalog/', url), 302);
    }

    if (url.pathname.startsWith('/api/')) {
      const upstream = new URL(url.pathname + url.search, NETLIFY_API_ORIGIN);
      const proxied = new Request(upstream, request);
      return fetch(proxied);
    }

    return env.ASSETS.fetch(request);
  }
};
