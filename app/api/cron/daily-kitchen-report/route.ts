export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

async function sendWhatsApp(text: string): Promise<{ ok: boolean; error?: string }> {
  const token    = process.env.WHATSAPP_API_TOKEN;
  const phoneId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to       = process.env.WHATSAPP_RECIPIENT_PHONE;

  if (!token || !phoneId || !to) {
    return { ok: false, error: 'Missing WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_RECIPIENT_PHONE env vars' };
  }

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  // Auth — Vercel sends the CRON_SECRET as a Bearer token
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayIST();
  const supabase = createAdminClient();

  // Fetch items + today's logs in parallel
  const [itemsRes, logsRes] = await Promise.all([
    supabase.from('daily_kitchen_items').select('id, name, unit').eq('active', true).order('sort_order'),
    supabase.from('daily_kitchen_logs').select('item_id, shift, quantity').eq('log_date', today),
  ]);

  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (logsRes.error)  return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  const items = itemsRes.data ?? [];
  const logs  = logsRes.data  ?? [];

  // Build map: item_id → { in, closing }
  const map: Record<string, { in?: number; closing?: number }> = {};
  for (const l of logs) {
    if (!map[l.item_id]) map[l.item_id] = {};
    map[l.item_id][l.shift as 'in' | 'closing'] = l.quantity;
  }

  // Only include items that have at least one entry today
  const rows = items
    .map(item => ({
      name:       item.name,
      unit:       item.unit ?? '',
      inQty:      map[item.id]?.in,
      closingQty: map[item.id]?.closing,
      consumed:   map[item.id]?.in !== undefined && map[item.id]?.closing !== undefined
                    ? map[item.id]!.in! - map[item.id]!.closing!
                    : undefined,
    }))
    .filter(r => r.inQty !== undefined || r.closingQty !== undefined);

  if (rows.length === 0) {
    return NextResponse.json({ sent: false, reason: 'No kitchen logs for today' });
  }

  // Format WhatsApp message
  const dateStr = fmtDate(today);
  const lines: string[] = [];

  lines.push(`*🥬 Daily Kitchen Report*`);
  lines.push(`_${dateStr}_`);
  lines.push('');

  const hasIn      = rows.some(r => r.inQty      !== undefined);
  const hasClosing = rows.some(r => r.closingQty !== undefined);

  if (hasIn) {
    lines.push('*🌅 Morning IN*');
    for (const r of rows) {
      if (r.inQty !== undefined) {
        lines.push(`  ${r.name}: *${r.inQty}* ${r.unit}`);
      }
    }
    lines.push('');
  }

  if (hasClosing) {
    lines.push('*🌙 Closing*');
    for (const r of rows) {
      if (r.closingQty !== undefined) {
        lines.push(`  ${r.name}: *${r.closingQty}* ${r.unit}`);
      }
    }
    lines.push('');
  }

  const consumed = rows.filter(r => r.consumed !== undefined);
  if (consumed.length > 0) {
    lines.push('*📊 Consumed Today*');
    for (const r of consumed) {
      const val = r.consumed!;
      const sign = val < 0 ? '🔼 restocked' : val === 0 ? '⚪ unchanged' : '';
      lines.push(`  ${r.name}: *${Math.abs(val)}* ${r.unit}${sign ? ` (${sign})` : ''}`);
    }
    lines.push('');
  }

  lines.push(`_café tan 90° · automated report_`);

  const message = lines.join('\n');
  const result  = await sendWhatsApp(message);

  if (!result.ok) {
    console.error('[daily-kitchen-report]', result.error);
    return NextResponse.json({ sent: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ sent: true, date: today, items: rows.length });
}
