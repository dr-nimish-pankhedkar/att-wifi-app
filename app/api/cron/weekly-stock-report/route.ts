export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import nodemailer from 'nodemailer';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}

function getWeekRange(): { from: string; to: string; label: string } {
  const today = new Date(todayIST() + 'T00:00:00');
  const day   = today.getDay(); // 0=Sun … 5=Fri
  const daysToMon = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMon);
  const from = monday.toISOString().split('T')[0];
  const to   = todayIST();
  const fmt  = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return { from, to, label: `${fmt(from)} – ${fmt(to)}` };
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

  const { from, to, label } = getWeekRange();
  const supabase = createAdminClient();

  // Fetch all active items (with min_level)
  const { data: items, error: itemsErr } = await supabase
    .from('inventory_items')
    .select('id, name, unit, category, min_level')
    .eq('active', true)
    .order('category')
    .order('sort_order');
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  // Fetch logs: go back 60 days before 'from' to find opening stock, up to 'to'
  const lookback = new Date(from + 'T00:00:00');
  lookback.setDate(lookback.getDate() - 60);
  const lookbackDate = lookback.toISOString().split('T')[0];

  const { data: logs, error: logsErr } = await supabase
    .from('inventory_logs')
    .select('item_id, quantity, log_date')
    .gte('log_date', lookbackDate)
    .lte('log_date', to)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 });

  // Latest log per item on or before 'from' (opening) and on or before 'to' (closing)
  const openingMap: Record<string, { qty: number; date: string }> = {};
  const closingMap: Record<string, { qty: number; date: string }> = {};
  for (const l of logs ?? []) {
    if (l.log_date <= from && !openingMap[l.item_id]) {
      openingMap[l.item_id] = { qty: l.quantity, date: l.log_date };
    }
    if (l.log_date <= to && !closingMap[l.item_id]) {
      closingMap[l.item_id] = { qty: l.quantity, date: l.log_date };
    }
  }

  // Build consumption rows (only items with at least one log in range)
  const consumptionRows = (items ?? [])
    .map(item => {
      const opening = openingMap[item.id];
      const closing = closingMap[item.id];
      const consumed = opening && closing ? opening.qty - closing.qty : undefined;
      return { ...item, opening, closing, consumed };
    })
    .filter(r => r.opening || r.closing);

  // Build shopping list: current stock <= min_level
  const shoppingRows = (items ?? [])
    .filter(item => {
      if (!item.min_level || item.min_level <= 0) return false;
      const latest = closingMap[item.id] ?? openingMap[item.id];
      if (!latest) return true; // never logged — flag it
      return latest.qty <= item.min_level;
    })
    .map(item => {
      const latest = closingMap[item.id] ?? openingMap[item.id];
      const current = latest?.qty ?? 0;
      const need    = item.min_level - current;
      return { ...item, current, need };
    });

  const year = new Date(to + 'T00:00:00').getFullYear();
  const subjectLine = `📦 Weekly Stock Report — ${label} ${year}`;

  // ── HTML helpers ────────────────────────────────────────────────────────────
  const th = (...cols: string[]) => cols.map(c =>
    `<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px;background:#f9fafb">${c}</th>`
  ).join('');

  const td = (v: string, s = '') =>
    `<td style="padding:9px 12px;font-size:13px;border-bottom:1px solid #f3f4f6;${s}">${v}</td>`;

  // Consumption section
  const consumptionHtml = consumptionRows.length === 0
    ? `<p style="padding:16px;color:#9ca3af;font-size:13px">No stock logs recorded this week.</p>`
    : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr>${th('Item', 'Category', 'Opening', 'Closing (Present)', 'Consumed')}</tr></thead>
        <tbody>${consumptionRows.map(r => {
          const c = r.consumed;
          let cCell: string;
          if (c === undefined)  cCell = td('—', 'color:#9ca3af');
          else if (c < 0)       cCell = td(`+${Math.abs(c)} ${r.unit} <small style="color:#9ca3af">(restocked)</small>`, 'color:#10b981;font-weight:600');
          else if (c === 0)     cCell = td('no change', 'color:#9ca3af');
          else                  cCell = td(`${c} ${r.unit}`, 'color:#f59e0b;font-weight:600');
          return `<tr>
            ${td(r.name, 'font-weight:500')}
            ${td(r.category ?? '—', 'color:#6b7280;font-size:12px')}
            ${td(r.opening ? `${r.opening.qty} ${r.unit}` : '—', r.opening ? '' : 'color:#9ca3af')}
            ${td(r.closing ? `${r.closing.qty} ${r.unit}` : '—', r.closing ? 'color:#1d4ed8;font-weight:600' : 'color:#9ca3af')}
            ${cCell}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

  // Shopping list section
  const shoppingHtml = shoppingRows.length === 0
    ? `<p style="padding:16px;color:#6b7280;font-size:13px">✅ All items are above minimum levels.</p>`
    : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr>${th('Item', 'Current Stock', 'Min Level', 'Need to Buy')}</tr></thead>
        <tbody>${shoppingRows.map(r => `<tr>
          ${td(r.name, 'font-weight:500')}
          ${td(`${r.current} ${r.unit}`, 'color:#dc2626;font-weight:600')}
          ${td(`${r.min_level} ${r.unit}`, 'color:#6b7280')}
          ${td(`${r.need} ${r.unit}`, 'color:#111827;font-weight:700')}
        </tr>`).join('')}</tbody>
      </table></div>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
  <div style="background:#1e3a5f;padding:20px 24px">
    <p style="margin:0;color:#93c5fd;font-size:11px;letter-spacing:1px;text-transform:uppercase">café tan 90°</p>
    <h1 style="margin:4px 0 0;color:#fff;font-size:20px">📦 Weekly Stock Report</h1>
    <p style="margin:4px 0 0;color:#93c5fd;font-size:13px">${label} ${year}</p>
  </div>

  <div style="padding:16px 24px 4px">
    <h2 style="margin:0 0 4px;font-size:15px;color:#1e3a5f">📊 Consumption This Week</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#9ca3af">Opening vs closing stock levels</p>
  </div>
  ${consumptionHtml}

  <div style="padding:20px 24px 4px">
    <h2 style="margin:0 0 4px;font-size:15px;color:#dc2626">🛒 Shopping List</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#9ca3af">Items at or below minimum level</p>
  </div>
  ${shoppingHtml}

  <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;margin-top:8px">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Weekly automated report · café tan 90°</p>
  </div>
</div></body></html>`;

  // ── Plain text ────────────────────────────────────────────────────────────
  const textLines: string[] = [
    `Weekly Stock Report — ${label} ${year}`, '='.repeat(56), '',
    '📊 CONSUMPTION THIS WEEK',
    `${'Item'.padEnd(22)} ${'Opening'.padEnd(12)} ${'Closing'.padEnd(12)} Consumed`,
    '-'.repeat(62),
    ...consumptionRows.map(r => {
      const c = r.consumed;
      const cStr = c === undefined ? '—' : c < 0 ? `+${Math.abs(c)} ${r.unit} (restocked)` : `${c} ${r.unit}`;
      return `${r.name.padEnd(22)} ${String(r.opening?.qty ?? '—').padEnd(12)} ${String(r.closing?.qty ?? '—').padEnd(12)} ${cStr}`;
    }),
    '',
    '🛒 SHOPPING LIST (below minimum)',
    '-'.repeat(62),
  ];
  if (shoppingRows.length === 0) {
    textLines.push('All items above minimum levels ✅');
  } else {
    textLines.push(`${'Item'.padEnd(22)} ${'Current'.padEnd(12)} ${'Min'.padEnd(12)} Need`);
    textLines.push('-'.repeat(62));
    for (const r of shoppingRows) {
      textLines.push(`${r.name.padEnd(22)} ${String(r.current).padEnd(12)} ${String(r.min_level).padEnd(12)} ${r.need} ${r.unit}`);
    }
  }
  textLines.push('', 'café tan 90° · automated weekly report');

  const result = await sendEmail(subjectLine, html, textLines.join('\n'));
  if (!result.ok) {
    console.error('[weekly-stock-report]', result.error);
    return NextResponse.json({ sent: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ sent: true, week: label, consumption: consumptionRows.length, shopping: shoppingRows.length });
}
