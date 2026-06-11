export async function sendEmail(
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.REPORT_EMAIL_TO;
  const from   = process.env.REPORT_EMAIL_FROM ?? 'reports@cafetan90.in';

  if (!apiKey || !to) {
    return { ok: false, error: 'Missing RESEND_API_KEY or REPORT_EMAIL_TO env vars' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `café tan 90° <${from}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    return { ok: false, error: body };
  }
  return { ok: true };
}
