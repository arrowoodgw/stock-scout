import { NextResponse } from 'next/server';
import { readPortfolio } from '@/lib/portfolio';

export async function GET() {
  try {
    const portfolio = await readPortfolio();
    return NextResponse.json(portfolio);
  } catch {
    return NextResponse.json({ error: 'Could not read portfolio.' }, { status: 500 });
  }
}
