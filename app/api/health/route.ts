import { NextResponse } from 'next/server';
import { getCacheHealth } from '@/lib/dataCache';

export async function GET() {
  return NextResponse.json(getCacheHealth());
}
