export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today    = todayIST();
  const supabase = createAdminClient();

  const [itemsRes, logsRes] = await Promise.all([
    supabase.from('daily_kitchen_items').select('id, name, unit').eq('active', true).order('sort_order'),
    supabase.from('daily_kitchen_logs')
      .select('item_id, shift, quantity, profiles(name)')
      .eq('log_date', today),
  ]);
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (logsRes.error)  return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  const items = itemsRes.data ?? [];
  const logs  = logsRes.data  ?? [];

  // Build daily total map and collect logger names
  const map: Record<string, number> = {};
  const loggerNames = new Set<string>();

  for (const l of logs) {
    map[l.item_id] = (map[l.item_id] ?? 0) + l.quantity;
    const name = (l.profiles as { name?: string } | null)?.name;
    if (name) loggerNames.add(name);
  }

  const rows = items
    .map(item => ({
      name: item.name,
      unit: item.unit ?? '',
      qty:  map[item.id],
    }))
    .filter(r => r.qty !== undefined);

  if (rows.length === 0) return NextResponse.json({ sent: false, reason: 'No kitchen logs for today' });

  const dateStr  = fmtDate(today);
  const loggedBy = [...loggerNames].join(', ') || 'unknown';

  // ── HTML ─────────────────────────────────────────────────────────────────
  const th = (t: string) => `<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">${t}</th>`;
  const td = (v: string, s = '') => `<td style="padding:9px 12px;font-size:13px;border-bottom:1px solid #f3f4f6;${s}">${v}</td>`;

  const rowsHtml = rows.map(r =>
    `<tr>
      ${td(r.name, 'font-weight:500')}
      ${td(`${r.qty} ${r.unit}`, 'color:#0f766e;font-weight:600')}
    </tr>`
  ).join('');

  const loggerBadge = `<span style="display:inline-block;margin:4px 8px 4px 0;padding:3px 10px;border-radius:20px;font-size:12px;background:#0f766e;color:#fff">Logged by <strong>${loggedBy}</strong></span>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <div style="background:#134e4a;padding:20px 24px">
    <p style="margin:0;color:#99f6e4;font-size:11px;letter-spacing:1px;text-transform:uppercase">café tan 90°</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:20px">🥬 Daily Kitchen Report</h1>
    <p style="margin:4px 0 0;color:#99f6e4;font-size:13px">${dateStr}</p>
  </div>
  <div style="padding:12px 16px 4px">${loggerBadge}</div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th('Item')}${th('Today\'s Total')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Automated daily report · café tan 90°</p>
  </div>
</div></body></html>`;

  // ── Plain text ────────────────────────────────────────────────────────────
  const textLines = [
    `Daily Kitchen Report — ${dateStr}`, '',
    `Logged by: ${loggedBy}`,
    '',
    `${'Item'.padEnd(24)} Total`,
    '-'.repeat(40),
    ...rows.map(r => `${r.name.padEnd(24)} ${r.qty} ${r.unit}`),
    '', 'café tan 90° · automated report',
  ];

  const result = await sendEmail(`🥬 Kitchen Report — ${dateStr}`, html, textLines.join('\n'));
  if (!result.ok) {
    console.error('[daily-kitchen-report]', result.error);
    return NextResponse.json({ sent: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ sent: true, date: today, items: rows.length });
}
