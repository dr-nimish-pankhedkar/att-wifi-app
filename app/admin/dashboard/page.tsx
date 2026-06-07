'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import StatCards, { StatCardsSkeleton } from '@/components/admin/StatCards';
import AttendanceTable, { AttendanceTableSkeleton } from '@/components/admin/AttendanceTable';
import { formatDateIST } from '@/lib/time';

interface DashboardData {
  total: number;
  present: number;
  late: number;
  absent: number;
  records: unknown[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login');
    });
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [router, supabase.auth]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground text-sm">{formatDateIST(new Date())}</p>
        </div>

        {loading ? (
          <>
            <StatCardsSkeleton />
            <div className="mt-6"><AttendanceTableSkeleton /></div>
          </>
        ) : data ? (
          <>
            <StatCards stats={{ total: data.total, present: data.present, late: data.late, absent: data.absent }} />
            <div className="mt-6">
              <h3 className="font-semibold mb-3">Today&apos;s Attendance</h3>
              <AttendanceTable records={data.records as never} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
