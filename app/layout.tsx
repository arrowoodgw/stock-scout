import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/AppNav';

export const metadata: Metadata = {
  title: 'Stock Scout',
  description: 'Milestone 3 stock rankings and backtest lite with mocked data'
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
