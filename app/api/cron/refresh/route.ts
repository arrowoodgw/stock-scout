import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCacheSnapshot, triggerRefresh } from '@/lib/dataCache';

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  await triggerRefresh();
  const snapshot = await getCacheSnapshot();

  return NextResponse.json({
    ok: true,
    refreshed: true,
    status: snapshot.status,
    lastUpdated: snapshot.lastUpdated,
    tickerCount: snapshot.tickers.length
  });
}
