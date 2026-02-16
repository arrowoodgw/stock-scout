'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home' },
  { href: '/ticker', label: 'Ticker Detail' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/backtest', label: 'Backtest Lite' }
];

export function AppNav() {
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
