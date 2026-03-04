/**
 * app/rankings/page.tsx
 *
 * Redirect — the canonical rankings URL is the root path (/), not /rankings.
 * This route exists so that any old bookmarks or links to /rankings still work.
 */

import { redirect } from 'next/navigation';

export default function RankingsRedirect() {
  // Permanently redirect /rankings → / (the actual Rankings page).
  redirect('/');
}
