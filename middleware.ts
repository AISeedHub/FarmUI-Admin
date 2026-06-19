// Basic Auth gate for the docs site (Vercel Edge Middleware).
//
// Protects every route behind HTTP Basic Auth so the site isn't publicly readable
// and bots/crawlers get a 401. Set these Environment Variables on the Vercel project
// (Settings → Environment Variables, Production):
//   DOCS_USER     — the username
//   DOCS_PASSWORD — the password
//
// Fail-closed: until both are set, every request returns 401 (the site is locked).
// A change to the env vars requires a redeploy to take effect.

export const config = {
  // Run on all paths so HTML *and* assets (css/js/img) are all gated.
  matcher: '/:path*',
};

export default function middleware(request: Request): Response | undefined {
  const user = process.env.DOCS_USER ?? '';
  const password = process.env.DOCS_PASSWORD ?? '';
  const header = request.headers.get('authorization') ?? '';

  if (user && password && header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice('Basic '.length));
      const sep = decoded.indexOf(':');
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === password) {
        return undefined; // authenticated → let the request through
      }
    } catch {
      // malformed header → fall through to 401
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Farm-Docs", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
