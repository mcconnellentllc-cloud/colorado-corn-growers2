// CORS is a strict allowlist. Only the two production origins of the static
// site may talk to this Worker, and only with credentials, because every
// authenticated endpoint depends on the session cookie riding along.

const ALLOWED_ORIGINS = new Set([
  'https://cologrowers.com',
  'https://www.cologrowers.com',
]);

/**
 * Headers to attach to a response for `request`. An origin that is not on the
 * allowlist gets no Access-Control-Allow-Origin at all, so the browser blocks
 * the response.
 */
export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export function isAllowedOrigin(origin) {
  return Boolean(origin) && ALLOWED_ORIGINS.has(origin);
}

/** Preflight response for OPTIONS. */
export function preflight(request) {
  const headers = corsHeaders(request);
  if (!headers['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
