import { formatTimeIST } from '@/lib/time';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'present' | 'late' | 'absent';
  notes: string | null;
  profiles: { id: string; name: string; designation: string | null } | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'outline'> = {
  present: 'success',
  late: 'warning',
  absent: 'danger',
};

export function AttendanceTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export default function AttendanceTable({ records }: { records: AttendanceRecord[] }) {
  if (!records.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No attendance records found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Staff</th>
            <th className="text-left px-4 py-3 font-medium">Date</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Check In</th>
            <th className="text-left px-4 py-3 font-medium">Check Out</th>
            <th className="text-left px-4 py-3 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                <div className="font-medium">{r.profiles?.name ?? '—'}</div>
                {r.profiles?.designation && (
                  <div className="text-xs text-muted-foreground">{r.profiles.designation}</div>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'} className="capitalize">
                  {r.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {r.check_in_time ? formatTimeIST(r.check_in_time) : '—'}
              </td>
              <td className="px-4 py-3">
                {r.check_out_time ? formatTimeIST(r.check_out_time) : '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
