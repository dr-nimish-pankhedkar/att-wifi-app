'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, FileText, Settings, LogOut, Menu, X, CalendarDays, Package, Salad, BarChart2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const NAV = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Staff', href: '/admin/staff', icon: Users },
  { label: 'Schedule', href: '/admin/schedule', icon: CalendarDays },
  { label: 'Inventory', href: '/admin/inventory', icon: Package },
  { label: 'Daily Kitchen', href: '/admin/daily-kitchen', icon: Salad },
  { label: 'Consumption', href: '/admin/consumption', icon: BarChart2 },
  { label: 'Reports', href: '/admin/reports', icon: FileText },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const supabase = createClient();

  async function logout() {
    await supabase.auth.signOut();
    toast.success('Logged out');
    router.push('/admin/login');
  }

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(href))
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {label}
        </Link>
      ))}
      <button
        onClick={logout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mt-2"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-30">
        <span className="font-bold text-lg">Attendance Admin</span>
        <button onClick={() => setOpen(!open)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute left-0 top-0 h-full w-64 bg-background border-r p-4 pt-16"
            onClick={(e) => e.stopPropagation()}
          >
            {navLinks}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-background p-4 min-h-screen">
        <div className="mb-6">
          <h1 className="font-bold text-lg">Attendance</h1>
          <p className="text-xs text-muted-foreground">Admin Panel</p>
        </div>
        {navLinks}
      </aside>
    </>
  );
}
