/**
 * app/layout.tsx
 *
 * Root layout — wraps every page in the application.
 *
 * Responsibilities:
 *   - Sets the HTML <lang> attribute and document <title> / <meta description>.
 *   - Injects global CSS (app/globals.css — dark Bloomberg-style theme).
 *   - Renders the persistent top navigation bar (AppNav) above page content.
 *
 * This is a React Server Component (no 'use client') — it runs on the server
 * only and never re-renders on the client after hydration.
 */

import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/AppNav';

export const metadata: Metadata = {
  title: 'Stock Scout',
  description: 'Stock analysis app with Top 50 market-cap universe, on-demand history, SEC fundamentals, and portfolio tracking'
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
