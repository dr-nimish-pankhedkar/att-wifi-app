'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import PinPad from '@/components/kiosk/PinPad';
import { posLogin, type StoredSession } from '@/lib/pos/client';

export default function PosLogin({ title, subtitle, onLogin }: { title: string; subtitle: string; onLogin: (s: StoredSession) => void }) {
  const [loading, setLoading] = useState(false);
  async function submit(pin: string) {
    setLoading(true);
    try {
      onLogin(await posLogin(pin));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-900 via-stone-800 to-stone-900 flex flex-col items-center justify-center gap-10 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-white/50 text-sm mt-1">{subtitle}</p>
      </div>
      <PinPad onSubmit={submit} loading={loading} />
    </main>
  );
}
