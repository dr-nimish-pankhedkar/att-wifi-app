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
          onSubmit(next);
          setPin('');
        }
      }
    },
    [pin, loading, onSubmit]
  );

  return (
    <div className="flex flex-col items-center gap-8">
      {/* PIN dots */}
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-5 w-5 rounded-full border-2 border-white/60 transition-all duration-150',
              i < pin.length ? 'bg-white scale-110' : 'bg-transparent'
            )}
          />
        ))}
      </div>

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {KEYS.map((key, idx) => {
          if (key === '') return <div key={idx} />;
          return (
            <button
              key={idx}
              onClick={() => handleKey(key)}
              disabled={loading}
              className={cn(
                'flex items-center justify-center h-16 rounded-2xl text-2xl font-semibold',
                'bg-white/10 border border-white/20 text-white',
                'hover:bg-white/20 active:scale-95 transition-all duration-100',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                key === 'del' && 'text-base'
              )}
            >
              {key === 'del' ? <Delete className="w-6 h-6" /> : key}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-white/70">
          <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          <span className="text-sm">Verifying...</span>
        </div>
      )}
    </div>
  );
}
