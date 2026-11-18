export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';
import { saveMenuItem } from '@/lib/pos/saveMenuItem';

export async function POST(request: NextRequest) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body) return bad('Invalid body');
  const res = await saveMenuItem(createAdminClient(), null, body);
  if (res.error) return bad(res.error);
  return NextResponse.json({ id: res.id }, { status: 201 });
}
