export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAdminAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

/**
 * POST — staff or admin can log a stock check.
 * Body: { log_date: "YYYY-MM-DD", entries: [{ item_id, quantity, notes? }], staff_id? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.log_date || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: 'log_date and entries[] are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // logged_by: use provided staff_id, or fall back to admin session
  let loggedBy: string | null = body.staff_id ?? null;
  if (!loggedBy) {
    try {
      const auth = createClient();
      const { data: { user } } = await auth.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        loggedBy = profile?.id ?? null;
      }
    } catch {
      // non-fatal
    }
  }

  const rows = (body.entries as Array<{ item_id: string; quantity: number; notes?: string }>)
    .filter((e) => e.item_id && e.quantity !== undefined && e.quantity !== null)
    .map((e) => ({
      item_id: e.item_id,
      quantity: Number(e.quantity),
      notes: e.notes ?? null,
      logged_by: loggedBy,
      log_date: body.log_date,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ saved: 0 });
  }

  const itemIds = rows.map((r) => r.item_id);
  await supabase
    .from('inventory_logs')
    .delete()
    .eq('log_date', body.log_date)
    .in('item_id', itemIds);

  const { data, error } = await supabase
    .from('inventory_logs')
    .insert(rows)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: data?.length ?? 0 });
}

/** GET — admin only: log history */
export async function GET(request: NextRequest) {
  const user = await requireAdminAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('item_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const supabase = createAdminClient();

  let query = supabase
    .from('inventory_logs')
    .select('id, item_id, quantity, notes, log_date, created_at, profiles(name)')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (itemId) query = query.eq('item_id', itemId);
  if (from) query = query.gte('log_date', from);
  if (to) query = query.lte('log_date', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data });
}
