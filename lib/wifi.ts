const PRIVATE_RANGES = [
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^::1$/,
  /^localhost$/,
];

export function isPrivateIP(ip: string): boolean {
  const cleaned = ip.split(',')[0].trim();
  return PRIVATE_RANGES.some((re) => re.test(cleaned));
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
