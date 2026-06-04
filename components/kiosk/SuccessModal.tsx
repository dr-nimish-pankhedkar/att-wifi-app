'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CheckCircle, Clock, LogIn, LogOut } from 'lucide-react';
import { formatTimeIST, formatDateIST } from '@/lib/time';
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

interface SuccessModalProps {
  data: SuccessData;
  onClose: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  late: 'bg-yellow-100 text-yellow-800',
  absent: 'bg-red-100 text-red-800',
};

export default function SuccessModal({ data, onClose }: SuccessModalProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onClose();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        {/* Success icon */}
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-14 h-14 text-green-500" />
        </div>

        {/* Photo + Name */}
        <div className="flex flex-col items-center gap-3 mb-6">
          {data.photo_url ? (
            <Image
              src={data.photo_url}
              alt={data.name}
              width={80}
              height={80}
              className="rounded-full object-cover border-4 border-primary/20"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary">
              {data.name[0].toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{data.name}</h2>
            {data.designation && (
              <p className="text-sm text-gray-500">{data.designation}</p>
            )}
          </div>
        </div>

        {/* Action + Time */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {data.action === 'check_in' ? (
            <LogIn className="w-5 h-5 text-green-600" />
          ) : (
            <LogOut className="w-5 h-5 text-blue-600" />
          )}
          <span className="font-semibold text-gray-700">
            {data.action === 'check_in' ? 'Checked In' : 'Checked Out'}
          </span>
        </div>
        <div className="flex items-center justify-center gap-1 text-gray-500 mb-4">
          <Clock className="w-4 h-4" />
          <span className="text-sm">{formatTimeIST(data.time)}</span>
        </div>

        {/* Status badge */}
        {data.action === 'check_in' && (
          <span
            className={cn(
              'inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize mb-6',
              STATUS_STYLE[data.status] ?? 'bg-gray-100 text-gray-700'
            )}
          >
            {data.status}
          </span>
        )}

        {/* Last 7-day mini strip */}
        <div className="mt-2 mb-6">
          <p className="text-xs text-gray-400 mb-2">Last 7 days</p>
          <div className="flex justify-center gap-2">
            {data.last7days.map((rec) => (
              <div key={rec.date} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                    STATUS_STYLE[rec.status] ?? 'bg-gray-100 text-gray-400'
                  )}
                  title={`${rec.date}: ${rec.status}`}
                >
                  {rec.status === 'present' ? 'P' : rec.status === 'late' ? 'L' : 'A'}
                </div>
                <span className="text-[10px] text-gray-400">
                  {new Date(rec.date).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Countdown */}
        <p className="text-xs text-gray-400">Closing in {countdown}s</p>
      </div>
    </div>
  );
}
