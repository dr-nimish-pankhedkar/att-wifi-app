'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import PinPad from '@/components/kiosk/PinPad';
import SuccessModal from '@/components/kiosk/SuccessModal';

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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Attendance</h1>
        <p className="text-white/60 mt-2 text-lg">Enter your PIN to check in / check out</p>
      </div>

      <PinPad onSubmit={handlePinSubmit} loading={loading} />

      {successData && (
        <SuccessModal data={successData} onClose={() => setSuccessData(null)} />
      )}
    </main>
  );
}
