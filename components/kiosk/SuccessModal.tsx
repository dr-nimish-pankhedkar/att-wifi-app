'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Clock, LogIn, LogOut } from 'lucide-react';
import { formatTimeIST } from '@/lib/time';
import { cn } from '@/lib/utils';

interface AttendanceRecord {
  date: string;
  status: 'present' | 'late' | 'absent';
  check_in_time: string | null;
  check_out_time: string | null;
}

interface SuccessData {
  name: string;
  designation: string | null;
  photo_url: string | null;
  action: 'check_in' | 'check_out';
  time: string;
  status: string;
  last7days: AttendanceRecord[];
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  late: 'bg-yellow-100 text-yellow-800',
  absent: 'bg-red-100 text-red-800',
};

export default function SuccessModal({ data, onClose }: { data: SuccessData; onClose: () => void }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); onClose(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onClose]);

  const isCheckIn = data.action === 'check_in';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Sheet slides up from bottom on mobile, centered on tablet */}
      <div className="bg-white w-full sm:max-w-md sm:mx-4 sm:rounded-3xl rounded-t-3xl shadow-2xl px-6 pt-6 pb-8 text-center">

        {/* Drag handle on mobile */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />

        {/* Icon */}
        <div className="flex justify-center mb-3">
          <div className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center',
            isCheckIn ? 'bg-green-100' : 'bg-blue-100'
          )}>
            {isCheckIn
              ? <LogIn className="w-7 h-7 text-green-600" />
              : <LogOut className="w-7 h-7 text-blue-600" />}
          </div>
        </div>

        {/* Action label */}
        <p className={cn('text-sm font-semibold uppercase tracking-widest mb-3',
          isCheckIn ? 'text-green-600' : 'text-blue-600')}>
          {isCheckIn ? 'Checked In' : 'Checked Out'}
        </p>

        {/* Photo + Name */}
        <div className="flex items-center gap-4 bg-gray-50 rounded-2xl px-4 py-3 mb-4 text-left">
          {data.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.photo_url} alt={data.name}
              className="w-[52px] h-[52px] rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
              {data.name[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-lg leading-tight truncate">{data.name}</p>
            {data.designation && <p className="text-sm text-gray-500 truncate">{data.designation}</p>}
          </div>
        </div>

        {/* Time + Status row */}
        <div className="flex items-center justify-center gap-4 mb-5">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Clock className="w-4 h-4" />
            <span className="font-mono font-semibold">{formatTimeIST(data.time)}</span>
          </div>
          {isCheckIn && (
            <span className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold capitalize',
              STATUS_STYLE[data.status] ?? 'bg-gray-100 text-gray-700'
            )}>
              {data.status}
            </span>
          )}
        </div>

        {/* Last 7 days strip */}
        {data.last7days.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-gray-400 mb-2">Last 7 days</p>
            <div className="flex justify-center gap-2">
              {data.last7days.map((rec) => (
                <div key={rec.date} className="flex flex-col items-center gap-1">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                    STATUS_STYLE[rec.status] ?? 'bg-gray-100 text-gray-400'
                  )}>
                    {rec.status === 'present' ? 'P' : rec.status === 'late' ? 'L' : 'A'}
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(rec.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Countdown progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1 mb-2 overflow-hidden">
          <div
            className="h-1 bg-gray-400 rounded-full transition-all duration-1000"
            style={{ width: `${(countdown / 5) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">Closing in {countdown}s</p>
      </div>
    </div>
  );
}
