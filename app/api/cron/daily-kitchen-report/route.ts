export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

async function sendEmail(subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to   = process.env.REPORT_EMAIL_TO;
  if (!user || !pass || !to) return { ok: false, error: 'Missing SMTP_USER / SMTP_PASS / REPORT_EMAIL_TO' };
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  try {
    await transporter.sendMail({ from: `"café tan 90°" <${user}>`, to, subject, html, text });
    return { ok: true };
  } catch (e: unknown) { return { ok: false, error: String(e) }; }
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
    supabase.from('daily_kitchen_logs').select('item_id, shift, quantity').eq('log_date', today),
  ]);
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (logsRes.error)  return NextResponse.json({ error: logsRes.error.message }, { status: 500 });

  const items = itemsRes.data ?? [];
  const logs  = logsRes.data  ?? [];

  const map: Record<string, { in?: number; closing?: number }> = {};
  for (const l of logs) {
    if (!map[l.item_id]) map[l.item_id] = {};
    map[l.item_id][l.shift as 'in' | 'closing'] = l.quantity;
  }

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

  if (rows.length === 0) return NextResponse.json({ sent: false, reason: 'No kitchen logs for today' });

  const dateStr = fmtDate(today);

  const th = (t: string) => `<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">${t}</th>`;
  const td = (v: string, s = '') => `<td style="padding:9px 12px;font-size:13px;border-bottom:1px solid #f3f4f6;${s}">${v}</td>`;

  const rowsHtml = rows.map(r => {
    const c = r.consumed;
    let consumedCell: string;
    if (c === undefined)      consumedCell = td('—', 'color:#9ca3af');
    else if (c < 0)           consumedCell = td(`+${Math.abs(c)} ${r.unit} <small style="color:#9ca3af">(restocked)</small>`, 'color:#10b981;font-weight:600');
    else if (c === 0)         consumedCell = td(`0 ${r.unit}`, 'color:#9ca3af');
    else                      consumedCell = td(`${c} ${r.unit}`, 'color:#f59e0b;font-weight:600');
    return `<tr>
      ${td(r.name, 'font-weight:500')}
      ${td(r.inQty !== undefined ? `${r.inQty} ${r.unit}` : '—', r.inQty !== undefined ? '' : 'color:#9ca3af')}
      ${td(r.closingQty !== undefined ? `${r.closingQty} ${r.unit}` : '—', r.closingQty !== undefined ? 'color:#1d4ed8;font-weight:600' : 'color:#9ca3af')}
      ${consumedCell}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <div style="background:#78350f;padding:20px 24px">
    <p style="margin:0;color:#fde68a;font-size:11px;letter-spacing:1px;text-transform:uppercase">café tan 90°</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:20px">🥬 Daily Kitchen Report</h1>
    <p style="margin:4px 0 0;color:#fde68a;font-size:13px">${dateStr}</p>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${th('Item')}${th('🌅 Morning IN')}${th('🌙 Present (Closing)')}${th('📊 Consumed')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Automated daily report · café tan 90°</p>
  </div>
</div></body></html>`;

  const textLines = [
    `Daily Kitchen Report — ${dateStr}`, '',
    `${'Item'.padEnd(20)} ${'IN'.padEnd(10)} ${'Present'.padEnd(10)} Consumed`,
    '-'.repeat(58),
    ...rows.map(r => {
      const c = r.consumed;
      const cStr = c === undefined ? '—' : c < 0 ? `+${Math.abs(c)} ${r.unit} (restocked)` : `${c} ${r.unit}`;
      return `${r.name.padEnd(20)} ${String(r.inQty ?? '—').padEnd(10)} ${String(r.closingQty ?? '—').padEnd(10)} ${cStr}`;
    }),
    '', 'café tan 90° · automated report',
  ];

  const result = await sendEmail(`🥬 Kitchen Report — ${dateStr}`, html, textLines.join('\n'));
  if (!result.ok) {
    console.error('[daily-kitchen-report]', result.error);
    return NextResponse.json({ sent: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ sent: true, date: today, items: rows.length });
}
