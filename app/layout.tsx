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
