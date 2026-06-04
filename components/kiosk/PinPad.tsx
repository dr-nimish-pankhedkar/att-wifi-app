'use client';

import { useState, useCallback } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  loading: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PinPad({ onSubmit, loading }: PinPadProps) {
  const [pin, setPin] = useState('');

  const handleKey = useCallback(
    (key: string) => {
      if (loading) return;
      if (key === 'del') {
        setPin((p) => p.slice(0, -1));
      } else if (pin.length < 4) {
        const next = pin + key;
        setPin(next);
        if (next.length === 4) {
          setTimeout(() => {
            onSubmit(next);
            setPin('');
          }, 120); // brief pause so last dot fills before submit
        }
      }
    },
    [pin, loading, onSubmit]
  );

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xs">
      {/* PIN dots */}
      <div className="flex gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 w-4 rounded-full border-2 border-white/40 transition-all duration-150',
              i < pin.length
                ? 'bg-white border-white scale-125'
                : 'bg-transparent'
            )}
          />
        ))}
      </div>

      {/* Keypad grid — fills available width up to max-w-xs */}
      <div className="grid grid-cols-3 gap-3 w-full px-2">
        {KEYS.map((key, idx) => {
          if (key === '') return <div key={idx} />;
          return (
            <button
              key={idx}
              onClick={() => handleKey(key)}
              disabled={loading}
              className={cn(
                'flex items-center justify-center rounded-2xl text-2xl font-semibold select-none',
                'bg-white/10 border border-white/20 text-white',
                'active:scale-95 active:bg-white/25 transition-all duration-100',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'h-16 sm:h-20', // taller on larger screens
                key === 'del' && 'text-lg'
              )}
            >
              {key === 'del' ? <Delete className="w-6 h-6" /> : key}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-white/60">
          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-sm">Verifying…</span>
        </div>
      )}
    </div>
  );
}
