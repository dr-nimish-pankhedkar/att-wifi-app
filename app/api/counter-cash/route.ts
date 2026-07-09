export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type DenomKey = 'count_500' | 'count_200' | 'count_100' | 'count_50' | 'count_20_note' | 'count_20_coin' | 'count_10_note' | 'count_10_coin';

const DENOM_CONFIG: Array<{ key: DenomKey; value: number }> = [
  { key: 'count_500',     value: 500 },
  { key: 'count_200',     value: 200 },
  { key: 'count_100',     value: 100 },
  { key: 'count_50',      value: 50  },
  { key: 'count_20_note', value: 20  },
  { key: 'count_20_coin', value: 20  },
  { key: 'count_10_note', value: 10  },
  { key: 'count_10_coin', value: 10  },
];

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.log_date) {
    return NextResponse.json({ error: 'log_date required' }, { status: 400 });
  }

  let total = 0;
  const counts: Record<string, number> = {};
  for (const d of DENOM_CONFIG) {
    const n = Math.max(0, Math.floor(Number(body[d.key] ?? 0)));
    counts[d.key] = n;
    total += n * d.value;
  }

  const entryType = body.entry_type === 'taken_home' ? 'taken_home' : 'counter';
  const supabase = createAdminClient();

  if (entryType === 'counter') {
    // One counter entry per day — manual upsert
    const { data: existing } = await supabase
      .from('counter_cash_logs')
      .select('id')
      .eq('log_date', body.log_date)
      .or('entry_type.eq.counter,entry_type.is.null')
      .maybeSingle();

    const payload = {
      log_date: body.log_date,
      entry_type: 'counter',
      ...counts,
      total,
      cash_taken: 0,
      cash_taken_by: null,
      logged_by: body.staff_id ?? null,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = existing
      ? await supabase.from('counter_cash_logs').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('counter_cash_logs').insert(payload).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ log: data });
  } else {
    // Taken home — separate insert each time, records exact denominations taken
    const { data, error } = await supabase
      .from('counter_cash_logs')
      .insert({
        log_date: body.log_date,
        entry_type: 'taken_home',
        ...counts,
        total,
        cash_taken: total,
        cash_taken_by: body.cash_taken_by ?? null,
        logged_by: body.staff_id ?? null,
        notes: body.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ log: data });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

  const supabase = createAdminClient();
  let query = supabase
    .from('counter_cash_logs')
    .select('id, log_date, entry_type, count_500, count_200, count_100, count_50, count_20_note, count_20_coin, count_10_note, count_10_coin, total, cash_taken, cash_taken_by, logged_by, notes, created_at, updated_at')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);

  if (from) query = query.gte('log_date', from);
  if (to)   query = query.lte('log_date', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const staffIds = [...new Set((data ?? []).map(l => l.logged_by).filter(Boolean))];
  const nameMap: Record<string, string> = {};
  if (staffIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', staffIds);
    for (const p of profiles ?? []) nameMap[p.id] = p.name;
  }

  return NextResponse.json({
    logs: (data ?? []).map(l => ({
      ...l,
      logged_by_name: l.logged_by ? (nameMap[l.logged_by] ?? null) : null,
    })),
  });
}
