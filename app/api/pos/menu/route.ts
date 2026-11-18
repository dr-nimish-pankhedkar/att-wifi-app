export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePosUser, unauthorized } from '@/lib/pos/auth';
import { loadMenu } from '@/lib/pos/menu';

/** GET ?all=1 (admins) returns hidden items/categories too. */
export async function GET(request: NextRequest) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const all = request.nextUrl.searchParams.get('all') === '1' && actor.isAdmin;
  try {
    const menu = await loadMenu(createAdminClient(), all);
    return NextResponse.json(menu);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
