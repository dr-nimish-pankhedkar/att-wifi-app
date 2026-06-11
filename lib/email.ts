import nodemailer from 'nodemailer';

export async function sendEmail(
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to   = process.env.REPORT_EMAIL_TO;

  if (!user || !pass || !to) {
    return { ok: false, error: 'Missing SMTP_USER / SMTP_PASS / REPORT_EMAIL_TO env vars' };
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  try {
    await transporter.sendMail({ from: `"café tan 90°" <${user}>`, to, subject, html, text });
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}
