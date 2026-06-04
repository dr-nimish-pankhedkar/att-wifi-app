'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import ShiftManager, { type Shift } from '@/components/admin/ShiftManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Plus, Trash2, Wifi, Loader2, Upload, ImageIcon } from 'lucide-react';

interface Settings {
  id: string;
  company_name: string;
  shift_start_time: string;
  late_threshold_minutes: number;
  allowed_ips: string | null;
  logo_url: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ipList, setIpList] = useState<string[]>([]);
  const [newIp, setNewIp] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const loadShifts = useCallback(() => {
    fetch('/api/shifts').then((r) => r.json()).then((d) => setShifts(d.shifts ?? []));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      Promise.all([
        fetch('/api/settings').then((r) => r.json()),
        fetch('/api/shifts').then((r) => r.json()),
      ]).then(([settingsData, shiftsData]) => {
        setSettings(settingsData.settings);
        const ips = settingsData.settings?.allowed_ips
          ? settingsData.settings.allowed_ips.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
        setIpList(ips);
        setShifts(shiftsData.shifts ?? []);
      }).finally(() => setLoading(false));
    });
  }, [router, supabase.auth]);

  async function uploadLogo(file: File) {
    if (!settings) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Logo must be under 5 MB'); return; }
    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logo.${ext}`;
      const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
      if (error) { toast.error('Logo upload failed'); return; }
      const { data } = supabase.storage.from('logos').getPublicUrl(path);
      const logoUrl = data.publicUrl + `?t=${Date.now()}`;
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: logoUrl }),
      });
      if (res.ok) {
        const d = await res.json();
        setSettings(d.settings);
        toast.success('Logo updated');
      }
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    if (!settings) return;
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo_url: null }),
    });
    if (res.ok) {
      const d = await res.json();
      setSettings(d.settings);
      toast.success('Logo removed');
    }
  }

  async function detectMyIp() {
    setDetecting(true);
    try {
      const res = await fetch('/api/my-ip');
      const data = await res.json();
      if (data.ip) {
        setNewIp(data.ip);
        toast.success(`Detected: ${data.ip}`);
      }
    } catch {
      toast.error('Could not detect IP');
    } finally {
      setDetecting(false);
    }
  }

  function addIp() {
    const trimmed = newIp.trim();
    if (!trimmed) return;
    // Basic IP format validation
    const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (!ipv4.test(trimmed)) {
      toast.error('Enter a valid IPv4 address (e.g. 103.45.67.89)');
      return;
    }
    if (ipList.includes(trimmed)) {
      toast.error('This IP is already in the list');
      return;
    }
    setIpList([...ipList, trimmed]);
    setNewIp('');
  }

  function removeIp(ip: string) {
    setIpList(ipList.filter((i) => i !== ip));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          allowed_ips: ipList.join(','),
        }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error);
      else {
        toast.success('Settings saved');
        setSettings(data.settings);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto max-w-2xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground text-sm">Configure shift timings, company details, and WiFi access</p>
        </div>

        {loading ? (
          <Card><CardContent className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent></Card>
        ) : settings ? (
          <>
          <form onSubmit={handleSave} className="space-y-5">
            {/* General settings */}
            <Card>
              <CardHeader><CardTitle>General</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={settings.company_name}
                    onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                    placeholder="My Company"
                  />
                </div>
                <div>
                  <Label>Shift Start Time (IST)</Label>
                  <Input
                    type="time"
                    value={settings.shift_start_time.slice(0, 5)}
                    onChange={(e) =>
                      setSettings({ ...settings, shift_start_time: e.target.value + ':00' })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Check-ins after this time + grace period are marked &quot;late&quot;
                  </p>
                </div>
                <div>
                  <Label>Late Threshold (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={settings.late_threshold_minutes}
                    onChange={(e) =>
                      setSettings({ ...settings, late_threshold_minutes: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Grace period after shift start before marking as late
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* WiFi IP allowlist */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" /> Office WiFi IPs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Only devices connecting from these public IPs can check in.
                  Click &quot;Detect My IP&quot; from the office network to find yours.
                </p>

                {/* Current IP list */}
                {ipList.length > 0 ? (
                  <div className="space-y-2">
                    {ipList.map((ip) => (
                      <div key={ip} className="flex items-center justify-between px-3 py-2 bg-muted rounded-md">
                        <span className="font-mono text-sm">{ip}</span>
                        <button
                          type="button"
                          onClick={() => removeIp(ip)}
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
                    No IPs added — check-in is currently blocked for everyone. Add your office IP below.
                  </p>
                )}

                {/* Add new IP */}
                <div className="flex gap-2">
                  <Input
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder="e.g. 103.45.67.89"
                    className="font-mono"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIp(); } }}
                  />
                  <Button type="button" variant="outline" onClick={detectMyIp} disabled={detecting}>
                    {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    <span className="ml-1 hidden sm:inline">Detect My IP</span>
                  </Button>
                  <Button type="button" onClick={addIp}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click &quot;Detect My IP&quot; while on office WiFi — it will auto-fill your current public IP.
                </p>
              </CardContent>
            </Card>

            <Button type="submit" disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </form>

          {/* Company Logo — standalone card, not inside the form */}
          <Card className="mt-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" /> Company Logo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Shown on the kiosk check-in screen above your company name.
              </p>
              {settings?.logo_url && (
                <div className="flex items-center gap-4">
                  <Image
                    src={settings.logo_url}
                    alt="Company logo"
                    width={80}
                    height={80}
                    className="object-contain rounded-md border bg-white p-1"
                  />
                  <Button variant="outline" size="sm" onClick={removeLogo}>
                    Remove
                  </Button>
                </div>
              )}
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors">
                <Upload className="w-4 h-4" />
                {logoUploading ? 'Uploading…' : settings?.logo_url ? 'Replace Logo' : 'Upload Logo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={logoUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                />
              </label>
              <p className="text-xs text-muted-foreground">PNG or SVG recommended, max 5 MB.</p>
            </CardContent>
          </Card>

          {/* Shift Templates */}
          <Card className="mt-5">
            <CardHeader>
              <CardTitle>Shift Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Define Morning, Evening, or Night shifts and assign them to individual staff members.
              </p>
              <ShiftManager shifts={shifts} onRefresh={loadShifts} />
            </CardContent>
          </Card>
          </>
        ) : (
          <p className="text-muted-foreground">Failed to load settings.</p>
        )}
      </main>
    </div>
  );
}
