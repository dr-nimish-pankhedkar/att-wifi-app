'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import PinPad from '@/components/kiosk/PinPad';
import SuccessModal from '@/components/kiosk/SuccessModal';
import { formatTimeIST, formatDateIST } from '@/lib/time';

interface CheckinResult {
  name: string;
  designation: string | null;
  photo_url: string | null;
  action: 'check_in' | 'check_out';
  time: string;
  status: string;
  last7days: Array<{
    date: string;
    status: 'present' | 'late' | 'absent';
    check_in_time: string | null;
    check_out_time: string | null;
  }>;
}

export default function KioskPage() {
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<CheckinResult | null>(null);
  const [companyName, setCompanyName] = useState('Attendance');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch company name + logo
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings?.company_name) setCompanyName(d.settings.company_name);
        if (d.settings?.logo_url) setLogoUrl(d.settings.logo_url);
      })
      .catch(() => {});
  }, []);

  const handlePinSubmit = useCallback(async (pin: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Something went wrong');
      } else {
        setSuccessData(data);
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-between px-4 py-8 safe-area-inset">

      {/* Top: logo + company + clock */}
      <div className="text-center w-full pt-4 flex flex-col items-center gap-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={companyName}
            className="w-16 h-16 object-contain rounded-xl"
          />
        )}
        <h1 className="text-2xl font-bold text-white tracking-tight">{companyName}</h1>
        <p className="text-4xl font-mono font-semibold text-white mt-1">
          {formatTimeIST(now)}
        </p>
        <p className="text-white/50 text-sm">{formatDateIST(now)}</p>
      </div>

      {/* Middle: PIN pad */}
      <div className="w-full flex flex-col items-center gap-6">
        <p className="text-white/70 text-base">Enter your PIN</p>
        <PinPad onSubmit={handlePinSubmit} loading={loading} />
      </div>

      {/* Bottom: subtle hint */}
      <p className="text-white/30 text-xs text-center pb-2">
        Must be connected to office WiFi
      </p>

      {successData && (
        <SuccessModal data={successData} onClose={() => setSuccessData(null)} />
      )}
    </main>
  );
}
