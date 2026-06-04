const IST_TZ = 'Asia/Kolkata';

export function nowIST(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }));
}

export function toIST(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.toLocaleString('en-US', { timeZone: IST_TZ }));
}

export function todayIST(): string {
  const now = nowIST();
  return now.toISOString().split('T')[0];
}

/** Returns "HH:MM" in IST */
export function formatTimeIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Returns "DD MMM YYYY" in IST */
export function formatDateIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    timeZone: IST_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Parse "HH:MM:SS" time string into today's UTC Date */
export function shiftTimeToday(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const now = nowIST();
  now.setHours(h, m, 0, 0);
  return now;
}
