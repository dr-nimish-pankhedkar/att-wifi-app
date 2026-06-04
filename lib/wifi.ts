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

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
}

function matchesCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = bits ? (~0 << (32 - parseInt(bits, 10))) >>> 0 : 0xffffffff;
  return (ipToNum(ip) & mask) === (ipToNum(range) & mask);
}

/**
 * Supported formats in the allowlist:
 *   106.213.45.67       exact IP
 *   106.213.*           prefix wildcard (matches 106.213.x.x)
 *   106.213.45.*        prefix wildcard (matches 106.213.45.x)
 *   106.213.0.0/16      CIDR range
 */
export function isAllowedIP(ip: string, allowlist: string[]): boolean {
  if (isPrivateIP(ip)) return true;
  return allowlist.some((entry) => {
    const pattern = entry.trim();
    if (!pattern) return false;
    if (pattern.includes('/')) return matchesCIDR(ip, pattern);
    if (pattern.includes('*')) {
      // Build prefix by dropping the wildcard segment and trailing dot
      const prefix = pattern.replace(/\*.*$/, '');
      return ip.startsWith(prefix);
    }
    return pattern === ip;
  });
}
