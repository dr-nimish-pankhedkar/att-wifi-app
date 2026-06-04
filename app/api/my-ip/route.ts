export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/wifi';

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  return NextResponse.json({ ip });
}
