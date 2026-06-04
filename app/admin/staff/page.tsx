'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import StaffTable, { StaffTableSkeleton } from '@/components/admin/StaffTable';

interface StaffMember {
  id: string;
  name: string;
  designation: string | null;
  photo_url: string | null;
  role: string;
  created_at: string;
  shift_id: string | null;
  shifts: { id: string; name: string; start_time: string } | null;
}

interface ShiftOption {
  id: string;
  name: string;
  start_time: string;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/staff').then((r) => r.json()),
      fetch('/api/shifts').then((r) => r.json()),
    ])
      .then(([staffData, shiftsData]) => {
        setStaff(staffData.staff ?? []);
        setShifts(shiftsData.shifts ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login');
      else loadData();
    });
  }, [router, supabase.auth, loadData]);

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Staff Management</h2>
          <p className="text-muted-foreground text-sm">Add, edit, or remove staff members</p>
        </div>
        {loading ? <StaffTableSkeleton /> : <StaffTable staff={staff} shifts={shifts} onRefresh={loadData} />}
      </main>
    </div>
  );
}
