// Shared Polygon.io rate limiter.
// Polygon free tier allows 5 requests per minute.
// All server-side Polygon API calls go through this single module so that
// separate services (universe quotes, individual quote fetches) do not
// accidentally combine to exceed the limit.

const MIN_REQUEST_INTERVAL_MS = 12 * 1000; // 12 s ≈ 5 req / min with margin

let lastRequestAt = 0;

export async function polygonRateLimitedFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed)
    );
  }
  lastRequestAt = Date.now();
  return fetch(url, { cache: 'no-store' });
}
