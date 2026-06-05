'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Upload, FileText, ExternalLink, Plus, Trash2, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

interface StaffProfile {
  id: string;
  name: string;
  designation: string | null;
  photo_url: string | null;
  date_of_joining: string | null;
  birthdate: string | null;
  aadhar_url: string | null;
  pan_url: string | null;
  shift_id: string | null;
}

interface Salary {
  base_pay: number;
  fuel_allowance: number;
  fixed_bonus: number;
}

interface Override {
  month: string;
  base_pay_override: number | null;
  fuel_override: number | null;
  bonus_override: number | null;
  notes: string | null;
}

interface LeaveBalance {
  accrued_pl: number;
  used_pl: number;
  pl_balance: number;
  comp_off_balance: number;
}

interface LeaveRecord {
  id: string;
  leave_date: string;
  type: string;
  status: string;
  notes: string | null;
}

const LEAVE_LABELS: Record<string, string> = {
  paid: 'Paid Leave',
  comp_off: 'Comp Off Granted',
  comp_off_used: 'Comp Off Used',
  unpaid: 'Unpaid Leave',
};

const LEAVE_COLORS: Record<string, string> = {
  paid: 'bg-blue-100 text-blue-800',
  comp_off: 'bg-green-100 text-green-800',
  comp_off_used: 'bg-orange-100 text-orange-800',
  unpaid: 'bg-red-100 text-red-800',
};

function nextBonusDate(doj: string): string {
  const d = new Date(doj);
  const now = new Date();
  // Find next 6-month anniversary
  let months = 0;
  while (true) {
    months += 6;
    const candidate = new Date(d);
    candidate.setMonth(candidate.getMonth() + months);
    if (candidate > now) {
      return candidate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
}

function calcSalary(salary: Salary, override: Override | null, doj: string | null, month: Date) {
  const base = override?.base_pay_override ?? salary.base_pay;
  const fuel = override?.fuel_override ?? salary.fuel_allowance;

  let bonus = 0;
  if (doj) {
    const dojDate = new Date(doj);
    const monthsDiff = (month.getFullYear() - dojDate.getFullYear()) * 12 + (month.getMonth() - dojDate.getMonth());
    const isBonusMonth = monthsDiff > 0 && monthsDiff % 6 === 0;
    bonus = override?.bonus_override ?? (isBonusMonth ? salary.fixed_bonus * 6 : 0);
  }

  return { base, fuel, bonus, net: base + fuel + bonus };
}

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [salary, setSalary] = useState<Salary>({ base_pay: 0, fuel_allowance: 0, fixed_bonus: 0 });
  const [override, setOverride] = useState<Override | null>(null);
  const [allOverrides, setAllOverrides] = useState<Override[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [profileForm, setProfileForm] = useState({ name: '', designation: '', date_of_joining: '', birthdate: '' });
  const [salaryForm, setSalaryForm] = useState({ base_pay: '', fuel_allowance: '', fixed_bonus: '' });
  const [overrideForm, setOverrideForm] = useState({ base_pay_override: '', fuel_override: '', bonus_override: '', notes: '' });
  const [showOverride, setShowOverride] = useState(false);
  const [newLeave, setNewLeave] = useState({ leave_date: '', type: 'paid', notes: '' });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [addingLeave, setAddingLeave] = useState(false);
  const [docUploading, setDocUploading] = useState<'aadhar' | 'pan' | null>(null);

  const currentMonth = new Date();
  currentMonth.setDate(1);
  const monthKey = currentMonth.toISOString().split('T')[0];

  const loadAll = useCallback(async () => {
    const [profileRes, salaryRes, leavesRes] = await Promise.all([
      fetch(`/api/staff`).then((r) => r.json()),
      fetch(`/api/staff/${id}/salary`).then((r) => r.json()),
      fetch(`/api/staff/${id}/leaves`).then((r) => r.json()),
    ]);
    const found = profileRes.staff?.find((s: StaffProfile) => s.id === id);
    if (found) {
      setProfile(found);
      setProfileForm({
        name: found.name,
        designation: found.designation ?? '',
        date_of_joining: found.date_of_joining ?? '',
        birthdate: found.birthdate ?? '',
      });
    }
    if (salaryRes.salary) {
      setSalary(salaryRes.salary);
      setSalaryForm({
        base_pay: String(salaryRes.salary.base_pay),
        fuel_allowance: String(salaryRes.salary.fuel_allowance),
        fixed_bonus: String(salaryRes.salary.fixed_bonus),
      });
    }
    if (salaryRes.override) {
      setOverride(salaryRes.override);
      setOverrideForm({
        base_pay_override: salaryRes.override.base_pay_override != null ? String(salaryRes.override.base_pay_override) : '',
        fuel_override: salaryRes.override.fuel_override != null ? String(salaryRes.override.fuel_override) : '',
        bonus_override: salaryRes.override.bonus_override != null ? String(salaryRes.override.bonus_override) : '',
        notes: salaryRes.override.notes ?? '',
      });
      setShowOverride(true);
    }
    setAllOverrides(salaryRes.overrides ?? []);
    if (leavesRes.balance) setLeaveBalance(leavesRes.balance);
    if (leavesRes.leaves) setLeaves(leavesRes.leaves);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      loadAll();
    });
  }, [router, supabase.auth, loadAll]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success('Profile saved');
      setProfile((p) => p ? { ...p, ...profileForm } : p);
    } finally { setSavingProfile(false); }
  }

  async function saveSalary() {
    setSavingSalary(true);
    try {
      const res = await fetch(`/api/staff/${id}/salary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_pay: Number(salaryForm.base_pay) || 0,
          fuel_allowance: Number(salaryForm.fuel_allowance) || 0,
          fixed_bonus: Number(salaryForm.fixed_bonus) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setSalary(data.salary);
      toast.success('Salary saved');
    } finally { setSavingSalary(false); }
  }

  async function saveOverride() {
    setSavingOverride(true);
    try {
      const res = await fetch(`/api/staff/${id}/salary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'override',
          month: monthKey,
          base_pay_override: overrideForm.base_pay_override !== '' ? Number(overrideForm.base_pay_override) : null,
          fuel_override: overrideForm.fuel_override !== '' ? Number(overrideForm.fuel_override) : null,
          bonus_override: overrideForm.bonus_override !== '' ? Number(overrideForm.bonus_override) : null,
          notes: overrideForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setOverride(data.override);
      toast.success('Override saved for this month');
    } finally { setSavingOverride(false); }
  }

  async function addLeave() {
    if (!newLeave.leave_date) { toast.error('Select a date'); return; }
    setAddingLeave(true);
    try {
      const res = await fetch(`/api/staff/${id}/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLeave),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success('Leave recorded');
      setNewLeave({ leave_date: '', type: 'paid', notes: '' });
      loadAll();
    } finally { setAddingLeave(false); }
  }

  async function deleteLeave(leaveId: string) {
    if (!confirm('Remove this leave record?')) return;
    const res = await fetch(`/api/staff/${id}/leaves?leaveId=${leaveId}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Removed'); loadAll(); }
    else toast.error('Failed');
  }

  async function uploadDoc(file: File, type: 'aadhar' | 'pan') {
    setDocUploading(type);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      form.append('staffId', id);
      const res = await fetch('/api/upload/document', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Upload failed'); return; }
      toast.success(`${type === 'aadhar' ? 'Aadhaar' : 'PAN'} uploaded`);
      loadAll();
    } finally { setDocUploading(null); }
  }

  async function viewDoc(path: string) {
    const res = await fetch(`/api/upload/document?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  }

  const salaryCalc = salary ? calcSalary(salary, override, profile?.date_of_joining ?? null, currentMonth) : null;

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <AdminNav />
        <main className="flex-1 p-6"><Skeleton className="h-64 w-full" /></main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            {profile?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photo_url} alt={profile.name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                {profile?.name[0].toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{profile?.name}</h2>
              <p className="text-sm text-muted-foreground">{profile?.designation ?? 'No designation'}</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="mb-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="salary">Salary</TabsTrigger>
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          {/* ─── PROFILE TAB ─── */}
          <TabsContent value="profile">
            <Card>
              <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Designation</Label>
                    <Input value={profileForm.designation} onChange={(e) => setProfileForm({ ...profileForm, designation: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date of Joining</Label>
                    <Input type="date" value={profileForm.date_of_joining} onChange={(e) => setProfileForm({ ...profileForm, date_of_joining: e.target.value })} />
                  </div>
                  <div>
                    <Label>Date of Birth</Label>
                    <Input type="date" value={profileForm.birthdate} onChange={(e) => setProfileForm({ ...profileForm, birthdate: e.target.value })} />
                  </div>
                </div>
                {profileForm.date_of_joining && (
                  <p className="text-xs text-muted-foreground">
                    Next bonus payout: <span className="font-medium">{nextBonusDate(profileForm.date_of_joining)}</span>
                  </p>
                )}
                <Button onClick={saveProfile} disabled={savingProfile}>
                  <Save className="w-4 h-4 mr-2" />
                  {savingProfile ? 'Saving…' : 'Save Profile'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── SALARY TAB ─── */}
          <TabsContent value="salary">
            <div className="space-y-4">
              {/* Monthly breakdown card */}
              {salaryCalc && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader><CardTitle className="text-base">
                    {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} Estimated Salary
                    {override && <Badge className="ml-2 text-xs" variant="outline">Overridden</Badge>}
                  </CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Base Pay</span><span>₹{salaryCalc.base.toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Fuel Allowance</span><span>₹{salaryCalc.fuel.toLocaleString('en-IN')}</span></div>
                      {salaryCalc.bonus > 0 && <div className="flex justify-between text-green-700"><span>Fixed Bonus (6-month payout)</span><span>₹{salaryCalc.bonus.toLocaleString('en-IN')}</span></div>}
                      <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                        <span>Total</span><span>₹{salaryCalc.net.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Base salary */}
              <Card>
                <CardHeader><CardTitle>Base Salary Components</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Base Pay (₹/month)</Label>
                      <Input type="number" min={0} value={salaryForm.base_pay} onChange={(e) => setSalaryForm({ ...salaryForm, base_pay: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <Label>Fuel Allowance (₹/month)</Label>
                      <Input type="number" min={0} value={salaryForm.fuel_allowance} onChange={(e) => setSalaryForm({ ...salaryForm, fuel_allowance: e.target.value })} placeholder="0" />
                    </div>
                    <div>
                      <Label>Fixed Bonus (₹/month)</Label>
                      <Input type="number" min={0} value={salaryForm.fixed_bonus} onChange={(e) => setSalaryForm({ ...salaryForm, fixed_bonus: e.target.value })} placeholder="0" />
                      <p className="text-xs text-muted-foreground mt-1">Paid as 6× lump sum every 6 months from DOJ</p>
                    </div>
                  </div>
                  <Button onClick={saveSalary} disabled={savingSalary}>
                    <Save className="w-4 h-4 mr-2" />
                    {savingSalary ? 'Saving…' : 'Save Salary'}
                  </Button>
                </CardContent>
              </Card>

              {/* Monthly override */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    Override for {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    <Button variant="outline" size="sm" onClick={() => setShowOverride(!showOverride)}>
                      {showOverride ? 'Hide' : 'Add Override'}
                    </Button>
                  </CardTitle>
                </CardHeader>
                {showOverride && (
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Leave a field blank to use the standard amount.</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Base Pay Override</Label>
                        <Input type="number" min={0} value={overrideForm.base_pay_override} onChange={(e) => setOverrideForm({ ...overrideForm, base_pay_override: e.target.value })} placeholder={String(salary.base_pay)} />
                      </div>
                      <div>
                        <Label>Fuel Override</Label>
                        <Input type="number" min={0} value={overrideForm.fuel_override} onChange={(e) => setOverrideForm({ ...overrideForm, fuel_override: e.target.value })} placeholder={String(salary.fuel_allowance)} />
                      </div>
                      <div>
                        <Label>Bonus Override</Label>
                        <Input type="number" min={0} value={overrideForm.bonus_override} onChange={(e) => setOverrideForm({ ...overrideForm, bonus_override: e.target.value })} placeholder="auto" />
                      </div>
                    </div>
                    <div>
                      <Label>Reason / Notes</Label>
                      <Input value={overrideForm.notes} onChange={(e) => setOverrideForm({ ...overrideForm, notes: e.target.value })} placeholder="e.g. Half month worked" />
                    </div>
                    <Button onClick={saveOverride} disabled={savingOverride}>
                      {savingOverride ? 'Saving…' : 'Save Override'}
                    </Button>
                  </CardContent>
                )}
              </Card>

              {/* Override history */}
              {allOverrides.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Override History</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {allOverrides.map((ov) => (
                        <div key={ov.month} className="flex items-center justify-between text-sm px-3 py-2 bg-muted/30 rounded-md">
                          <span className="font-medium">{new Date(ov.month + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                          <span className="text-muted-foreground text-xs">{ov.notes}</span>
                          <div className="text-xs space-x-2">
                            {ov.base_pay_override != null && <span>Base: ₹{ov.base_pay_override}</span>}
                            {ov.fuel_override != null && <span>Fuel: ₹{ov.fuel_override}</span>}
                            {ov.bonus_override != null && <span>Bonus: ₹{ov.bonus_override}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ─── LEAVES TAB ─── */}
          <TabsContent value="leaves">
            <div className="space-y-4">
              {/* Balance cards */}
              {leaveBalance && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'PL Accrued', value: leaveBalance.accrued_pl, color: 'text-blue-600' },
                    { label: 'PL Used', value: leaveBalance.used_pl, color: 'text-red-600' },
                    { label: 'PL Balance', value: leaveBalance.pl_balance, color: 'text-green-600' },
                    { label: 'Comp Off', value: leaveBalance.comp_off_balance, color: 'text-purple-600' },
                  ].map((item) => (
                    <Card key={item.label}>
                      <CardContent className="pt-4 text-center">
                        <p className={`text-3xl font-bold ${item.color}`}>{item.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add leave */}
              <Card>
                <CardHeader><CardTitle className="text-base">Record Leave / Grant Comp Off</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Date</Label>
                      <Input type="date" value={newLeave.leave_date} onChange={(e) => setNewLeave({ ...newLeave, leave_date: e.target.value })} />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={newLeave.type}
                        onChange={(e) => setNewLeave({ ...newLeave, type: e.target.value })}
                      >
                        <option value="paid">Paid Leave</option>
                        <option value="comp_off">Grant Comp Off</option>
                        <option value="comp_off_used">Comp Off Used</option>
                        <option value="unpaid">Unpaid Leave</option>
                      </select>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input value={newLeave.notes} onChange={(e) => setNewLeave({ ...newLeave, notes: e.target.value })} placeholder="Reason (optional)" />
                    </div>
                  </div>
                  <Button onClick={addLeave} disabled={addingLeave}>
                    <Plus className="w-4 h-4 mr-2" />
                    {addingLeave ? 'Adding…' : 'Add Record'}
                  </Button>
                </CardContent>
              </Card>

              {/* Leave history */}
              {leaves.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Leave History</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {leaves.map((leave) => (
                        <div key={leave.id} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-md">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm">
                              {new Date(leave.leave_date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAVE_COLORS[leave.type] ?? 'bg-gray-100 text-gray-700'}`}>
                              {LEAVE_LABELS[leave.type] ?? leave.type}
                            </span>
                            {leave.notes && <span className="text-xs text-muted-foreground">{leave.notes}</span>}
                          </div>
                          <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => deleteLeave(leave.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ─── DOCUMENTS TAB ─── */}
          <TabsContent value="documents">
            <div className="space-y-4">
              {(['aadhar', 'pan'] as const).map((type) => {
                const stored = type === 'aadhar' ? profile?.aadhar_url : profile?.pan_url;
                const label = type === 'aadhar' ? 'Aadhaar Card' : 'PAN Card';
                return (
                  <Card key={type}>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4" /> {label}
                    </CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {stored ? (
                        <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-md">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground flex-1">Document uploaded</span>
                          <Button size="sm" variant="outline" onClick={() => viewDoc(stored)}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No document uploaded yet.</p>
                      )}
                      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors">
                        <Upload className="w-4 h-4" />
                        {docUploading === type ? 'Uploading…' : stored ? `Replace ${label}` : `Upload ${label}`}
                        <input type="file" accept="image/*,.pdf" className="hidden"
                          disabled={docUploading !== null}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f, type); }} />
                      </label>
                      <p className="text-xs text-muted-foreground">PDF or image, max 10 MB. Stored securely (private).</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
