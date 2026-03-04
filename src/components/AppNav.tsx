'use client';

/**
 * src/components/AppNav.tsx
 *
 * Persistent top navigation bar rendered on every page.
 *
 * Uses Next.js <Link> for client-side navigation (no full page reload).
 * usePathname() returns the current URL path so the active link can be
 * highlighted with the "active" CSS class.
 *
 * This is a Client Component ('use client') because usePathname() is a
 * React hook that requires browser context.
 *
 * Links:
 *   /           → Rankings page (pre-computed Top 50 rankings)
 *   /ticker     → Ticker Detail page (search any symbol)
 *   /portfolio  → Portfolio simulation page
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Top-level navigation links in display order. */
const links = [
  { href: '/', label: 'Rankings' },
  { href: '/ticker', label: 'Ticker Detail' },
  { href: '/portfolio', label: 'Portfolio' }
];

export function AppNav() {
  // Returns the current path (e.g. "/ticker") for active-link highlighting.
  const pathname = usePathname();

  return (
    <nav className="appNav" aria-label="Primary">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? 'active' : ''}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
