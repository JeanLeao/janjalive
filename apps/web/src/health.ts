/**
 * Dedicated lightweight health check handler for web service (OPS-01).
 * Responds with JSON status without rendering React or TanStack Start SSR trees.
 */
export function handleWebHealth(request: Request): Response | null {
  const url = new URL(request.url);
  if (
    url.pathname === '/healthz-web' ||
    url.pathname === '/health-web' ||
    url.pathname === '/healthz'
  ) {
    return new Response(JSON.stringify({ status: 'ok', service: 'web' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  return null;
}
