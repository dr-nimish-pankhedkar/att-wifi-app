'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, Trash2, Save, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import StatCards, { StatCardsSkeleton } from '@/components/admin/StatCards';
import AttendanceTable, { AttendanceTableSkeleton } from '@/components/admin/AttendanceTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDateIST } from '@/lib/time';

interface AttendanceRecord {
  id?: string;
  staff_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'present' | 'late' | 'absent';
  half_day: boolean;
  notes: string | null;
  override_by_admin?: boolean;
}

interface StaffMember {
  id: string;
  name: string;
  designation: string | null;
  photo_url: string | null;
  shift_id: string | null;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

interface DashboardToday {
  total: number; present: number; late: number; absent: number; records: unknown[];
}

function toLocalTime(isoString: string | null): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function toISO(date: string, time: string): string {
  if (!time) return '';
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

// ─── Day cell ──────────────────────────────────────────────────────────────
function DayCell({
  record, isOff, isHoliday, isFuture, onClick,
}: {
  record: AttendanceRecord | undefined;
  isOff: boolean; isHoliday: boolean; isFuture: boolean;
  onClick: () => void;
}) {
  const base = 'w-7 h-7 rounded-full cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0';

  if (isFuture) return <div className={`${base} bg-gray-100 cursor-default opacity-50`} />;

  if (isOff || isHoliday) {
    return (
      <div
        className={`${base} bg-blue-300`}
        title={isHoliday ? 'Holiday' : 'Week Off'}
        onClick={onClick}
      />
    );
  }

  if (!record) {
    return (
      <div
        className={`${base} bg-gray-200 border-2 border-dashed border-gray-300`}
        title="No data — click to backfill"
        onClick={onClick}
      />
    );
  }

  if (record.half_day) {
    return (
      <div
        className={`${base} border border-gray-200`}
        style={{ background: 'linear-gradient(to right, #4ade80 50%, #f87171 50%)' }}
        title="Half Day"
        onClick={onClick}
      />
    );
  }

  const color =
    record.status === 'present' ? 'bg-green-400' :
    record.status === 'late' ? 'bg-amber-400' :
    'bg-red-400';

  return (
    <div
      className={`${base} ${color}`}
      title={`${record.status}${record.check_in_time ? ' · ' + toLocalTime(record.check_in_time) : ''}`}
      onClick={onClick}
    />
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [today, setToday] = useState<DashboardToday | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);

  // Monthly state
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [settings, setSettings] = useState<{ off_days: string }>({ off_days: '1' });
  const [monthLoading, setMonthLoading] = useState(true);

  // Edit dialog
  const [editDialog, setEditDialog] = useState<{
    staffId: string; staffName: string; date: string; record?: AttendanceRecord;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    status: 'present', half_day: false, check_in: '', check_out: '', notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  // Holiday management
  const [showHolidays, setShowHolidays] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const monthStr = monthDate.toISOString().slice(0, 7);
  const year = monthDate.getFullYear();
  const daysInMonth = new Date(year, monthDate.getMonth() + 1, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const offDays = (settings.off_days ?? '1').split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d));
  const holidayDates = new Set(holidays.map((h) => h.date));
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const loadMonth = useCallback(async () => {
    setMonthLoading(true);
    const [staffRes, monthRes, holidaysRes, settingsRes] = await Promise.all([
      fetch('/api/staff').then((r) => r.json()),
      fetch(`/api/attendance/monthly?month=${monthStr}`).then((r) => r.json()),
      fetch(`/api/holidays?year=${year}`).then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]);
    setStaff(staffRes.staff ?? []);
    if (monthRes.error) toast.error(`Attendance load failed: ${monthRes.error}`);
    setMonthRecords(monthRes.records ?? []);
    setHolidays(holidaysRes.holidays ?? []);
    setSettings(settingsRes.settings ?? { off_days: '1' });
    setMonthLoading(false);
  }, [monthStr, year]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      fetch('/api/dashboard').then((r) => r.json()).then(setToday).finally(() => setTodayLoading(false));
      loadMonth();
    });
  }, [router, supabase.auth, loadMonth]);

  function prevMonth() { const d = new Date(monthDate); d.setMonth(d.getMonth() - 1); setMonthDate(d); }
  function nextMonth() { const d = new Date(monthDate); d.setMonth(d.getMonth() + 1); setMonthDate(d); }

  function openEdit(staffMember: StaffMember, day: number) {
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
    const record = monthRecords.find((r) => r.staff_id === staffMember.id && r.date === dateStr);
    setEditDialog({ staffId: staffMember.id, staffName: staffMember.name, date: dateStr, record });
    setEditForm({
      status: record?.status ?? 'present',
      half_day: record?.half_day ?? false,
      check_in: toLocalTime(record?.check_in_time ?? null),
      check_out: toLocalTime(record?.check_out_time ?? null),
      notes: record?.notes ?? '',
    });
  }

  async function saveEdit() {
    if (!editDialog) return;
    setEditSaving(true);
    try {
      const payload = {
        staff_id: editDialog.staffId,
        date: editDialog.date,
        status: editForm.status,
        half_day: editForm.half_day,
        check_in_time: editForm.check_in ? toISO(editDialog.date, editForm.check_in) : null,
        check_out_time: editForm.check_out ? toISO(editDialog.date, editForm.check_out) : null,
        notes: editForm.notes || null,
      };
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success('Attendance saved');
      setEditDialog(null);
      loadMonth();
    } finally { setEditSaving(false); }
  }

  async function deleteRecord() {
    if (!editDialog?.record?.id || !confirm('Delete this attendance record?')) return;
    const res = await fetch(`/api/attendance?id=${editDialog.record.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Record deleted'); setEditDialog(null); loadMonth(); }
    else toast.error('Delete failed');
  }

  async function addHoliday() {
    if (!newHoliday.date || !newHoliday.name) { toast.error('Date and name required'); return; }
    const res = await fetch('/api/holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newHoliday),
    });
    if (res.ok) { toast.success('Holiday added'); setNewHoliday({ date: '', name: '' }); loadMonth(); }
    else toast.error('Failed');
  }

  async function deleteHoliday(id: string) {
    const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removed'); loadMonth(); }
  }

  // ── Monthly stats ──────────────────────────────────────────────────────
  const stats = staff.map((s) => {
    const recs = monthRecords.filter((r) => r.staff_id === s.id);
    const workingDays = dayNumbers.filter((d) => {
      const ds = `${monthStr}-${String(d).padStart(2, '0')}`;
      const dow = new Date(ds + 'T12:00:00').getDay();
      return !offDays.includes(dow) && !holidayDates.has(ds) && ds <= todayStr;
    }).length;
    const present = recs.filter((r) => r.status !== 'absent').length;
    const onTime = recs.filter((r) => r.status === 'present').length;
    const late = recs.filter((r) => r.status === 'late').length;
    const absent = workingDays - present;
    const halfDays = recs.filter((r) => r.half_day).length;
    const checkIns = recs.filter((r) => r.check_in_time).map((r) => toLocalTime(r.check_in_time));
    return { ...s, workingDays, present, onTime, late, absent: Math.max(0, absent), halfDays, checkIns };
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground text-sm">{formatDateIST(new Date())}</p>
        </div>

        {/* Today summary */}
        {todayLoading ? <StatCardsSkeleton /> : today ? (
          <>
            <StatCards stats={{ total: today.total, present: today.present, late: today.late, absent: today.absent }} />
            <div className="mt-4">
              <h3 className="font-semibold mb-3">Today&apos;s Attendance</h3>
              <AttendanceTable records={today.records as never} />
            </div>
          </>
        ) : null}

        {/* ── Monthly Calendar ── */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-lg font-semibold min-w-[160px] text-center">
                {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </span>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              {!monthLoading && (
                <span className={`text-xs border rounded px-2 py-1 ${monthRecords.length === 0 ? 'border-red-300 text-red-600 bg-red-50' : 'border-green-300 text-green-700 bg-green-50'}`}>
                  {monthRecords.length === 0 ? `⚠ 0 records (queried ${monthStr})` : `✓ ${monthRecords.length} records`}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowHolidays(!showHolidays)}>
                {showHolidays ? 'Hide Holidays' : '+ Holidays'}
              </Button>
            </div>
          </div>

          {/* Holiday manager */}
          {showHolidays && (
            <Card className="mb-4">
              <CardHeader><CardTitle className="text-base">Public Holidays — {year}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} className="w-40" />
                  <Input value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} placeholder="Holiday name" className="flex-1 min-w-[140px]" />
                  <Button onClick={addHoliday} size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {holidays.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {holidays.map((h) => (
                      <div key={h.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full text-xs">
                        <span className="text-blue-700 font-medium">{new Date(h.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        <span className="text-blue-600">{h.name}</span>
                        <button onClick={() => deleteHoliday(h.id)} className="text-blue-400 hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No holidays added yet.</p>}
              </CardContent>
            </Card>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Present</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Late</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Absent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-300 inline-block" /> Off / Holiday</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: 'linear-gradient(to right,#4ade80 50%,#f87171 50%)' }} /> Half Day</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-200 border-2 border-dashed border-gray-300 inline-block" /> No data (click to fill)</span>
          </div>

          {monthLoading ? <Skeleton className="h-48 w-full" /> : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/30 min-w-[130px]">Staff</th>
                      {dayNumbers.map((d) => {
                        const ds = `${monthStr}-${String(d).padStart(2, '0')}`;
                        const dow = new Date(ds + 'T12:00:00').getDay();
                        const isOff = offDays.includes(dow);
                        const isHol = holidayDates.has(ds);
                        const isWeekend = dow === 0 || dow === 6;
                        const isToday = ds === todayStr;
                        return (
                          <th key={d} className={`px-1 py-2 text-center font-medium min-w-[36px] ${isOff || isHol ? 'bg-blue-50' : isWeekend ? 'bg-slate-50' : ''} ${isToday ? 'bg-primary/10' : ''}`}>
                            <div className={isToday ? 'text-primary font-bold' : ''}>{d}</div>
                            <div className="text-[9px] text-muted-foreground font-normal">
                              {['Su','Mo','Tu','We','Th','Fr','Sa'][dow]}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((member) => (
                      <tr key={member.id} className="border-t hover:bg-muted/10">
                        <td className="px-3 py-1.5 sticky left-0 bg-background border-r">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {member.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={member.photo_url} alt={member.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">
                                {member.name[0]}
                              </div>
                            )}
                            <span className="truncate font-medium text-xs">{member.name}</span>
                          </div>
                        </td>
                        {dayNumbers.map((d) => {
                          const ds = `${monthStr}-${String(d).padStart(2, '0')}`;
                          const dow = new Date(ds + 'T12:00:00').getDay();
                          const isOff = offDays.includes(dow);
                          const isHol = holidayDates.has(ds);
                          const isFuture = ds > todayStr;
                          const record = monthRecords.find((r) => r.staff_id === member.id && r.date === ds);
                          return (
                            <td key={d} className={`px-1 py-1.5 text-center ${isOff || isHol ? 'bg-blue-50/50' : ''}`}>
                              <div className="flex justify-center">
                                <DayCell
                                  record={record}
                                  isOff={isOff}
                                  isHoliday={isHol}
                                  isFuture={isFuture}
                                  onClick={() => openEdit(member, d)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!staff.length && <p className="text-center py-8 text-sm text-muted-foreground">No staff yet.</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Monthly Stats Table ── */}
        {!monthLoading && staff.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold mb-3">
              Monthly Summary — {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </h3>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs">
                      <th className="text-left px-4 py-3">Staff</th>
                      <th className="text-center px-3 py-3">Working Days</th>
                      <th className="text-center px-3 py-3 text-green-700">Present</th>
                      <th className="text-center px-3 py-3 text-green-600">On Time</th>
                      <th className="text-center px-3 py-3 text-amber-600">Late</th>
                      <th className="text-center px-3 py-3 text-red-600">Absent</th>
                      <th className="text-center px-3 py-3 text-purple-600">Half Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.id} className="border-t hover:bg-muted/20 text-center">
                        <td className="text-left px-4 py-3">
                          <p className="font-medium text-sm">{s.name}</p>
                          {s.designation && <p className="text-xs text-muted-foreground">{s.designation}</p>}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{s.workingDays}</td>
                        <td className="px-3 py-3 font-semibold text-green-700">{s.present}</td>
                        <td className="px-3 py-3 text-green-600">{s.onTime}</td>
                        <td className="px-3 py-3 text-amber-600">{s.late}</td>
                        <td className="px-3 py-3 text-red-600">{s.absent}</td>
                        <td className="px-3 py-3 text-purple-600">{s.halfDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ── Edit / Backfill Dialog ── */}
      <Dialog open={!!editDialog} onOpenChange={(v) => { if (!v) setEditDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editDialog?.record ? 'Edit Attendance' : 'Backfill Attendance'}
            </DialogTitle>
          </DialogHeader>
          {editDialog && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
                <span className="font-medium">{editDialog.staffName}</span>
                <span className="text-muted-foreground">
                  {new Date(editDialog.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              <div>
                <Label>Status</Label>
                <div className="flex gap-2 mt-1">
                  {(['present', 'late', 'absent'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setEditForm({ ...editForm, status: s })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 capitalize transition-colors ${
                        editForm.status === s
                          ? s === 'present' ? 'bg-green-100 border-green-400 text-green-700'
                            : s === 'late' ? 'bg-amber-100 border-amber-400 text-amber-700'
                            : 'bg-red-100 border-red-400 text-red-700'
                          : 'border-muted text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.half_day}
                    onChange={(e) => setEditForm({ ...editForm, half_day: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm">Half Day</span>
                </label>
                {editDialog.record?.override_by_admin && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">admin edited</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Check-in Time (IST)</Label>
                  <Input
                    type="time"
                    value={editForm.check_in}
                    onChange={(e) => setEditForm({ ...editForm, check_in: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Check-out Time (IST)</Label>
                  <Input
                    type="time"
                    value={editForm.check_out}
                    onChange={(e) => setEditForm({ ...editForm, check_out: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Reason for edit / backfill..."
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {editDialog?.record?.id && (
              <Button variant="outline" className="text-destructive" onClick={deleteRecord}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              <Save className="w-4 h-4 mr-1" />
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
