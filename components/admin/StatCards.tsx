import { Users, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  total: number;
  present: number;
  late: number;
  absent: number;
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function StatCards({ stats }: { stats: Stats }) {
  const items = [
    { label: 'Total Staff', value: stats.total, icon: Users, color: 'text-blue-600' },
    { label: 'Present', value: stats.present, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Late', value: stats.late, icon: Clock, color: 'text-yellow-600' },
    { label: 'Absent', value: stats.absent, icon: XCircle, color: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <Card key={label}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-3xl font-bold">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
