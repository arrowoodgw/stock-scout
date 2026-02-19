/**
 * instrumentation.ts  (Next.js 14 server instrumentation hook)
 *
 * Runs once when the Next.js server process starts.
 * Kicks off the data preload so the cache is warm before the first user request arrives.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not in the Edge runtime or browser bundles)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { triggerPreload } = await import('@/lib/dataCache');
    // Non-blocking: let the server finish starting while data loads in background
    void triggerPreload(false);
  }
}
