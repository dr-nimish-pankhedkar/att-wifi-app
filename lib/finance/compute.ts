/** Pure aggregation for the finance dashboard (kept separate from data loading so it can be tested). */

export interface OrderIn {
  total: number; discount: number; cash_amount: number; upi_amount: number; payment_mode: string | null;
  settled_at: string; feedback_rating: string | null;
  items: { name: string; price: number; qty: number; kot_status: string }[];
}
export interface ExpenseIn { amount: number; category: string | null; expense_date: string; description: string | null }
export interface SalaryIn { staff_id: string; name: string; monthly: number; date_of_joining: string | null; last_date: string | null }
export interface AttendanceIn { staff_id: string; date: string; status: string; half_day: boolean }
export interface CashLogIn { log_date: string; total: number; entry_type: string | null; cash_taken: number | null }

export const istDate = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
const istHour = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
const round = (n: number) => Math.round(n * 100) / 100;

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

export function computeFinance(p: {
  from: string; to: string; orders: OrderIn[]; expenses: ExpenseIn[]; salaries: SalaryIn[];
  attendance: AttendanceIn[]; cashLogs: CashLogIn[];
}) {
  const days = daysBetween(p.from, p.to);

  // ── Sales ──
  const sales = round(p.orders.reduce((s, o) => s + Number(o.total), 0));
  const bills = p.orders.length;
  const cash = round(p.orders.reduce((s, o) => s + Number(o.cash_amount), 0));
  const upi = round(p.orders.reduce((s, o) => s + Number(o.upi_amount), 0));
  const discounts = round(p.orders.reduce((s, o) => s + Number(o.discount), 0));

  const salesByDay = new Map(days.map((d) => [d, 0]));
  const billsByHour = Array.from({ length: 24 }, () => ({ bills: 0, sales: 0 }));
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  const feedback = { loved: 0, okay: 0, improve: 0 };
  for (const o of p.orders) {
    const d = istDate(o.settled_at);
    salesByDay.set(d, (salesByDay.get(d) ?? 0) + Number(o.total));
    const h = istHour(o.settled_at);
    billsByHour[h].bills++; billsByHour[h].sales += Number(o.total);
    if (o.feedback_rating && o.feedback_rating in feedback) feedback[o.feedback_rating as keyof typeof feedback]++;
    for (const it of o.items) {
      if (it.kot_status === 'cancelled') continue;
      const cur = itemMap.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty; cur.revenue += Number(it.price) * it.qty;
      itemMap.set(it.name, cur);
    }
  }
  const items = Array.from(itemMap.values()).map((i) => ({ ...i, revenue: round(i.revenue) }));

  // ── Expenses ──
  const expenses = round(p.expenses.reduce((s, e) => s + Number(e.amount), 0));
  const expByDay = new Map(days.map((d) => [d, 0]));
  const expByCat = new Map<string, number>();
  for (const e of p.expenses) {
    expByDay.set(e.expense_date, (expByDay.get(e.expense_date) ?? 0) + Number(e.amount));
    const c = e.category || 'Uncategorised';
    expByCat.set(c, (expByCat.get(c) ?? 0) + Number(e.amount));
  }

  // ── Staff cost: monthly pay spread over the days each person was employed in the period ──
  const staffCost = p.salaries.map((s) => {
    let cost = 0;
    for (const d of days) {
      if (s.date_of_joining && d < s.date_of_joining) continue;
      if (s.last_date && d > s.last_date) continue;
      const [y, m] = d.split('-').map(Number);
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      cost += s.monthly / dim;
    }
    return { staff_id: s.staff_id, name: s.name, cost: round(cost) };
  });
  const staffTotal = round(staffCost.reduce((s, x) => s + x.cost, 0));

  // ── Attendance ──
  const att = new Map<string, { present: number; late: number; absent: number; half: number }>();
  for (const a of p.attendance) {
    const cur = att.get(a.staff_id) ?? { present: 0, late: 0, absent: 0, half: 0 };
    if (a.status === 'present') cur.present++;
    else if (a.status === 'late') cur.late++;
    else if (a.status === 'absent') cur.absent++;
    if (a.half_day) cur.half++;
    att.set(a.staff_id, cur);
  }

  // ── Counter cash ──
  const counter = p.cashLogs.filter((c) => (c.entry_type ?? 'counter') === 'counter').sort((a, b) => b.log_date.localeCompare(a.log_date));
  const takenHome = round(p.cashLogs.reduce((s, c) => s + (c.entry_type === 'taken_home' ? Number(c.total) : 0) + Number(c.cash_taken ?? 0), 0));

  return {
    period: { from: p.from, to: p.to, days: days.length },
    kpi: {
      sales, bills, avg_bill: bills ? round(sales / bills) : 0, cash, upi, discounts,
      expenses, staff_cost: staffTotal,
      net: round(sales - expenses - staffTotal),
    },
    daily: days.map((d) => ({ date: d, sales: round(salesByDay.get(d) ?? 0), expenses: round(expByDay.get(d) ?? 0) })),
    by_hour: billsByHour.map((h, hour) => ({ hour, bills: h.bills, sales: round(h.sales) })).filter((h) => h.bills > 0),
    top_by_revenue: [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    top_by_qty: [...items].sort((a, b) => b.qty - a.qty).slice(0, 8),
    expense_categories: Array.from(expByCat.entries()).map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    recent_expenses: [...p.expenses].sort((a, b) => b.expense_date.localeCompare(a.expense_date)).slice(0, 8),
    staff: p.salaries.map((s) => ({
      staff_id: s.staff_id, name: s.name, cost: staffCost.find((x) => x.staff_id === s.staff_id)?.cost ?? 0,
      ...(att.get(s.staff_id) ?? { present: 0, late: 0, absent: 0, half: 0 }),
    })).filter((s) => s.cost > 0 || s.present + s.late + s.absent > 0), // hide people who had left before the period
    attendance_unsalaried: Array.from(att.entries()).filter(([id]) => !p.salaries.some((s) => s.staff_id === id)).map(([staff_id, v]) => ({ staff_id, ...v })),
    counter_cash: counter[0] ? { date: counter[0].log_date, total: Number(counter[0].total) } : null,
    cash_taken_home: takenHome,
    feedback,
  };
}
