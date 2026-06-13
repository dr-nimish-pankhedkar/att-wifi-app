export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}
function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
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

  const today     = todayIST();
  const yesterday = shiftDate(today, -1);
  const supabase  = createAdminClient();

  const [itemsRes, logsRes, prevRes] = await Promise.all([
    supabase.from('daily_kitchen_items').select('id, name, unit').eq('active', true).order('sort_order'),
    supabase.from('daily_kitchen_logs')
      .select('item_id, shift, quantity, profiles(name)')
      .eq('log_date', today),
    supabase.from('daily_kitchen_logs')
      .select('item_id, shift, quantity')
      .eq('log_date', yesterday)
      .eq('shift', 'closing'),
  ]);
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (logsRes.error)  return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  const items = itemsRes.data ?? [];
  const logs  = logsRes.data  ?? [];

  // Build today's IN/Closing map and collect logger names per shift
  const map: Record<string, { in?: number; closing?: number }> = {};
  const loggers: { in: Set<string>; closing: Set<string> } = { in: new Set(), closing: new Set() };

  for (const l of logs) {
    const shift = l.shift as 'in' | 'closing';
    if (!map[l.item_id]) map[l.item_id] = {};
    map[l.item_id][shift] = l.quantity;
    const name = (l.profiles as { name?: string } | null)?.name;
    if (name) loggers[shift].add(name);
  }

  // Yesterday's closing stock per item
  const prevClosing: Record<string, number> = {};
  for (const l of prevRes.data ?? []) prevClosing[l.item_id] = l.quantity;

  const rows = items
    .map(item => {
      const todayIn    = map[item.id]?.in;
      const todayClose = map[item.id]?.closing;
      const yestClose  = prevClosing[item.id];
      // Consumption = yesterday closing + today IN − today closing
      const consumed =
        todayClose !== undefined
          ? (yestClose ?? 0) + (todayIn ?? 0) - todayClose
          : undefined;
      return { name: item.name, unit: item.unit ?? '', todayIn, todayClose, yestClose, consumed };
    })
    .filter(r => r.todayIn !== undefined || r.todayClose !== undefined);

  if (rows.length === 0) return NextResponse.json({ sent: false, reason: 'No kitchen logs for today' });

  const dateStr   = fmtDate(today);
  const inBy      = [...loggers.in].join(', ')      || 'unknown';
  const closingBy = [...loggers.closing].join(', ') || 'unknown';
  const hasIn     = rows.some(r => r.todayIn      !== undefined);
  const hasClosing = rows.some(r => r.todayClose  !== undefined);

  // ── HTML ─────────────────────────────────────────────────────────────────
  const th = (t: string) => `<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">${t}</th>`;
  const td = (v: string, s = '') => `<td style="padding:9px 12px;font-size:13px;border-bottom:1px solid #f3f4f6;${s}">${v}</td>`;

  const rowsHtml = rows.map(r => {
    const c = r.consumed;
    let consumedCell: string;
    if (c === undefined)  consumedCell = td('—', 'color:#9ca3af');
    else if (c <= 0)      consumedCell = td(`${c} ${r.unit}`, 'color:#9ca3af');
    else                  consumedCell = td(`${c} ${r.unit}`, 'color:#059669;font-weight:600');
    return `<tr>
      ${td(r.name, 'font-weight:500')}
      ${td(r.yestClose !== undefined ? `${r.yestClose} ${r.unit}` : '—', r.yestClose !== undefined ? 'color:#6b7280' : 'color:#9ca3af')}
      ${td(r.todayIn !== undefined ? `${r.todayIn} ${r.unit}` : '—', r.todayIn !== undefined ? 'color:#b45309;font-weight:600' : 'color:#9ca3af')}
      ${td(r.todayClose !== undefined ? `${r.todayClose} ${r.unit}` : '—', r.todayClose !== undefined ? 'color:#1d4ed8;font-weight:600' : 'color:#9ca3af')}
      ${consumedCell}
    </tr>`;
  }).join('');

  const loggerBadge = (label: string, names: string, color: string) =>
    `<span style="display:inline-block;margin:4px 8px 4px 0;padding:3px 10px;border-radius:20px;font-size:12px;background:${color};color:#fff">${label} <strong>${names}</strong></span>`;

  const loggerHtml = [
    hasIn      ? loggerBadge('🌅 IN by',      inBy,      '#b45309') : '',
    hasClosing ? loggerBadge('🌙 Closing by', closingBy, '#3730a3') : '',
  ].filter(Boolean).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <div style="background:#78350f;padding:20px 24px">
    <p style="margin:0;color:#fde68a;font-size:11px;letter-spacing:1px;text-transform:uppercase">café tan 90°</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:20px">🥬 Daily Kitchen Report</h1>
    <p style="margin:4px 0 0;color:#fde68a;font-size:13px">${dateStr}</p>
  </div>
  ${loggerHtml ? `<div style="padding:12px 16px 4px">${loggerHtml}</div>` : ''}
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th('Item')}${th('Yest. Closing')}${th('🌅 Today IN')}${th('🌙 Closing')}${th('📊 Consumed')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <p style="margin:0;padding:8px 16px 4px;font-size:11px;color:#9ca3af">Consumed = Yesterday Closing + Today IN − Today Closing</p>
  <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Automated daily report · café tan 90°</p>
  </div>
</div></body></html>`;

  // ── Plain text ────────────────────────────────────────────────────────────
  const textLines = [
    `Daily Kitchen Report — ${dateStr}`, '',
    ...(hasIn      ? [`🌅 Morning IN by: ${inBy}`]      : []),
    ...(hasClosing ? [`🌙 Closing by:    ${closingBy}`] : []),
    '',
    `${'Item'.padEnd(22)} ${'Yest.Close'.padEnd(12)} ${'Today IN'.padEnd(12)} ${'Closing'.padEnd(12)} Consumed`,
    '-'.repeat(72),
    ...rows.map(r => {
      const c = r.consumed;
      const cStr = c === undefined ? '—' : `${c} ${r.unit}`;
      return `${r.name.padEnd(22)} ${String(r.yestClose ?? '—').padEnd(12)} ${String(r.todayIn ?? '—').padEnd(12)} ${String(r.todayClose ?? '—').padEnd(12)} ${cStr}`;
    }),
    '', 'Consumed = Yesterday Closing + Today IN − Today Closing',
    'café tan 90° · automated report',
  ];

  const result = await sendEmail(`🥬 Kitchen Report — ${dateStr}`, html, textLines.join('\n'));
  if (!result.ok) {
    console.error('[daily-kitchen-report]', result.error);
    return NextResponse.json({ sent: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ sent: true, date: today, items: rows.length });
}
