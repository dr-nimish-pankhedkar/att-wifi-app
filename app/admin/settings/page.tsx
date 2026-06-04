'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Save } from 'lucide-react';

interface Settings {
  id: string;
  company_name: string;
  shift_start_time: string;
  late_threshold_minutes: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      fetch('/api/settings')
        .then((r) => r.json())
        .then((d) => setSettings(d.settings))
        .finally(() => setLoading(false));
    });
  }, [router, supabase.auth]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error);
      else { toast.success('Settings saved'); setSettings(data.settings); }
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
          <p className="text-muted-foreground text-sm">Configure shift timings and company details</p>
        </div>

        {loading ? (
          <Card><CardContent className="p-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent></Card>
        ) : settings ? (
          <Card>
            <CardHeader><CardTitle>Attendance Settings</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-5">
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
                <Button type="submit" disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving…' : 'Save Settings'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <p className="text-muted-foreground">Failed to load settings.</p>
        )}
      </main>
    </div>
  );
}
