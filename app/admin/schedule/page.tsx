'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface StaffMember {
  id: string;
  name: string;
  designation: string | null;
  photo_url: string | null;
  shift_id: string | null;
  shifts: { id: string; name: string; start_time: string } | null;
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
}

interface ShiftOverride {
  id: string;
  staff_id: string;
  override_date: string;
  shift_id: string | null;
  reason: string | null;
  shifts: { id: string; name: string; start_time: string } | null;
}

interface Settings {
  off_days: string | null;
  weekend_shift_id: string | null;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDates(anchor: Date): Date[] {
  // Week Mon–Sun
  const day = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function SchedulePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [overrides, setOverrides] = useState<ShiftOverride[]>([]);
  const [settings, setSettings] = useState<Settings>({ off_days: '1', weekend_shift_id: null });
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [weekDates, setWeekDates] = useState<Date[]>([]);

  // Dialog state
  const [dialog, setDialog] = useState<{ staffId: string; date: string; staffName: string; currentOverrideId?: string } | null>(null);
  const [dialogShift, setDialogShift] = useState('default');
  const [dialogReason, setDialogReason] = useState('');
  const [dialogSaving, setDialogSaving] = useState(false);

  const loadOverrides = useCallback(async (dates: Date[]) => {
    const from = dateStr(dates[0]);
    const to = dateStr(dates[6]);
    const res = await fetch(`/api/shift-overrides?from=${from}&to=${to}`);
    const data = await res.json();
    setOverrides(data.overrides ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    const dates = getWeekDates(weekAnchor);
    setWeekDates(dates);
    const [staffRes, shiftsRes, settingsRes] = await Promise.all([
      fetch('/api/staff').then((r) => r.json()),
      fetch('/api/shifts').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]);
    setStaff(staffRes.staff ?? []);
    setShifts(shiftsRes.shifts ?? []);
    setSettings(settingsRes.settings ?? {});
    await loadOverrides(dates);
    setLoading(false);
  }, [weekAnchor, loadOverrides]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      loadAll();
    });
  }, [router, supabase.auth, loadAll]);

  function prevWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d); }
  function nextWeek() { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d); }

  const offDays = (settings.off_days ?? '1').split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d));

  function getCell(staffId: string, date: Date) {
    const ds = dateStr(date);
    const override = overrides.find((o) => o.staff_id === staffId && o.override_date === ds);
    if (override) return { type: 'override' as const, override };

    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isOff = offDays.includes(dow);
    return { type: 'regular' as const, isOff, isWeekend };
  }

  function openDialog(staffMember: StaffMember, date: Date) {
    const ds = dateStr(date);
    const existing = overrides.find((o) => o.staff_id === staffMember.id && o.override_date === ds);
    setDialog({ staffId: staffMember.id, date: ds, staffName: staffMember.name, currentOverrideId: existing?.id });
    setDialogShift(existing?.shift_id ?? 'default');
    setDialogReason(existing?.reason ?? '');
  }

  async function saveOverride() {
    if (!dialog) return;
    setDialogSaving(true);
    try {
      const res = await fetch('/api/shift-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: dialog.staffId,
          override_date: dialog.date,
          shift_id: dialogShift === 'default' ? null : dialogShift,
          reason: dialogReason || null,
        }),
      });
      if (!res.ok) { toast.error('Failed to save'); return; }
      toast.success('Shift override saved');
      setDialog(null);
      await loadOverrides(weekDates);
    } finally { setDialogSaving(false); }
  }

  async function deleteOverride() {
    if (!dialog?.currentOverrideId) return;
    const res = await fetch(`/api/shift-overrides/${dialog.currentOverrideId}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Override removed'); setDialog(null); await loadOverrides(weekDates); }
    else toast.error('Failed to remove');
  }

  const weekLabel = weekDates.length
    ? `${weekDates[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold">Weekly Schedule</h2>
            <p className="text-muted-foreground text-sm">View and override staff shifts for each day</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevWeek}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-medium min-w-[180px] text-center">{weekLabel}</span>
            <Button variant="outline" size="icon" onClick={nextWeek}><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { setWeekAnchor(new Date()); }}>Today</Button>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium w-40">Staff</th>
                    {weekDates.map((d) => {
                      const dow = d.getDay();
                      const isOff = offDays.includes(dow);
                      const isWeekend = dow === 0 || dow === 6;
                      const isToday = dateStr(d) === dateStr(new Date());
                      return (
                        <th key={dateStr(d)} className={`px-3 py-3 text-center font-medium min-w-[100px] ${isOff ? 'bg-muted/50 text-muted-foreground' : isWeekend ? 'bg-blue-50' : ''}`}>
                          <div className={`text-xs ${isToday ? 'text-primary font-bold' : ''}`}>
                            {DAY_SHORT[dow]}
                          </div>
                          <div className={`text-base ${isToday ? 'text-primary font-bold' : ''}`}>
                            {d.getDate()}
                          </div>
                          {isOff && <div className="text-[10px] text-muted-foreground">Off</div>}
                          {!isOff && isWeekend && <div className="text-[10px] text-blue-500">Weekend</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <tr key={member.id} className="border-t hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {member.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={member.photo_url} alt={member.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                              {member.name[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate text-xs">{member.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{member.shifts?.name ?? 'Default'}</p>
                          </div>
                        </div>
                      </td>
                      {weekDates.map((d) => {
                        const cell = getCell(member.id, d);
                        const dow = d.getDay();
                        const isOff = offDays.includes(dow);
                        const weekendShift = shifts.find((s) => s.id === settings.weekend_shift_id);

                        return (
                          <td
                            key={dateStr(d)}
                            className={`px-2 py-2 text-center ${isOff ? 'bg-muted/30' : ''} ${!isOff ? 'cursor-pointer hover:bg-primary/5' : ''}`}
                            onClick={() => { if (!isOff) openDialog(member, d); }}
                          >
                            {isOff ? (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            ) : cell.type === 'override' ? (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium">
                                {cell.override.shifts?.name ?? 'Custom'}
                              </span>
                            ) : cell.isWeekend && weekendShift ? (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                                {weekendShift.name}
                              </span>
                            ) : (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full">
                                {member.shifts?.name ?? 'Default'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!staff.length && (
                <p className="text-center py-10 text-muted-foreground text-sm">No staff members yet.</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-muted rounded-full inline-block" /> Default shift</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-100 rounded-full inline-block" /> Weekend shift</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-100 rounded-full inline-block" /> Override</span>
          <span className="flex items-center gap-1.5">Click any cell to override a shift for that day</span>
        </div>
      </main>

      {/* Override Dialog */}
      <Dialog open={!!dialog} onOpenChange={(v) => { if (!v) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Shift</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{dialog.staffName}</span> on{' '}
                <span className="font-medium text-foreground">
                  {new Date(dialog.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                </span>
              </p>
              <div>
                <Label>Assign Shift</Label>
                <Select value={dialogShift} onValueChange={setDialogShift}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (no override)</SelectItem>
                    {shifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} · {s.start_time.slice(0, 5)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Input value={dialogReason} onChange={(e) => setDialogReason(e.target.value)} placeholder="e.g. Covering for Riya's leave" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {dialog?.currentOverrideId && (
              <Button variant="outline" className="text-destructive" onClick={deleteOverride}>
                <X className="w-4 h-4 mr-1" /> Remove Override
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={saveOverride} disabled={dialogSaving}>
              {dialogSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
