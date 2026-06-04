const PRIVATE_RANGES = [
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^::1$/,
  /^localhost$/,
];

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const raw = forwarded || real || '127.0.0.1';
  return raw.split(',')[0].trim();
}

export function isPrivateIP(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

/** Returns true if ip matches any entry in the allowlist OR is a private/local IP (for dev). */
export function isAllowedIP(ip: string, allowlist: string[]): boolean {
  if (isPrivateIP(ip)) return true;
  return allowlist.some((allowed) => allowed.trim() === ip);
}
