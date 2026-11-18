'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, Home, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shortcut bar for staff screens: Home · Tables · Kitchen.
 * `onTables` lets the captain app jump back to the table view without a page reload.
 */
export default function QuickNav({ dark = false, compact = false, onTables, className }: { dark?: boolean; compact?: boolean; onTables?: () => void; className?: string }) {
  const path = usePathname();
  const items = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/pos', label: 'Tables', icon: LayoutGrid },
    { href: '/kitchen', label: 'Kitchen', icon: ChefHat },
  ];
  return (
    <nav className={cn('flex items-center gap-1', className)}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href;
        const cls = cn(
          'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
          dark ? 'text-white/70 hover:bg-white/10' : 'text-stone-600 hover:bg-stone-100',
          active && (dark ? 'bg-white/15 text-white' : 'bg-stone-900 text-white hover:bg-stone-900'),
        );
        if (href === '/pos' && onTables) {
          return <button key={href} className={cls} onClick={() => onTables()} aria-label={label}><Icon className="w-4 h-4" />{!compact && label}</button>;
        }
        return <Link key={href} href={href} className={cls} aria-label={label}><Icon className="w-4 h-4" />{!compact && label}</Link>;
      })}
    </nav>
  );
}
