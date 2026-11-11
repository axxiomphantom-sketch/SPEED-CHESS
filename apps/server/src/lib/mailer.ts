/**
 * Transactional email.
 *
 * A provider is optional: when SMTP_URL is not configured the message is written to the server log
 * and `delivered` is false. Callers surface that honestly instead of claiming an email was sent.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

let transport: Transporter | null = null;
let transportChecked = false;

function getTransport(): Transporter | null {
  if (transportChecked) return transport;
  transportChecked = true;
  if (!config.smtpUrl) return null;
  try {
    transport = nodemailer.createTransport(config.smtpUrl, {
      // Never let a message read local files or fetch remote URLs.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } catch (err) {
    console.error('[mail] could not create the SMTP transport:', err);
    transport = null;
  }
  return transport;
}

export const emailConfigured = () => Boolean(config.smtpUrl);

export interface MailResult { delivered: boolean; reason?: 'not-configured' | 'send-failed' }

export async function sendMail(options: { to: string; subject: string; text: string; html?: string }): Promise<MailResult> {
  const client = getTransport();
  if (!client) {
    console.log(`[mail] (console mode) to=${options.to} subject="${options.subject}"\n${options.text}`);
    return { delivered: false, reason: 'not-configured' };
  }
  try {
    await client.sendMail({
      from: config.mailFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return { delivered: true };
  } catch (err) {
    console.error('[mail] send failed:', err);
    return { delivered: false, reason: 'send-failed' };
  }
}

const baseTemplate = (title: string, body: string, action?: { label: string; url: string }) => `<!doctype html>
<html><body style="margin:0;background:#090909;color:#ffffff;font-family:Inter,Helvetica,Arial,sans-serif;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#1C1C24;border:1px solid #30303A;border-radius:16px;padding:28px">
    <div style="font-size:13px;letter-spacing:.18em;color:#CBA7FF;font-weight:700">SPEED CHESS</div>
    <h1 style="font-size:22px;margin:14px 0 10px">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#A6A6B0">${body}</div>
    ${action ? `<p style="margin:24px 0 8px"><a href="${action.url}" style="display:inline-block;background:#7925D9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${action.label}</a></p>
    <p style="font-size:12px;color:#A6A6B0;word-break:break-all">Or paste this link into your browser:<br>${action.url}</p>` : ''}
    <p style="font-size:12px;color:#6E6E7A;margin-top:24px">If you did not request this, you can ignore this email.</p>
  </div>
</body></html>`;

export async function sendVerificationEmail(to: string, username: string, url: string) {
  return sendMail({
    to,
    subject: 'Confirm your SPEED CHESS email',
    text: `Welcome ${username}.\n\nConfirm your email address to finish setting up your account:\n${url}\n\nThis link expires in 24 hours.`,
    html: baseTemplate(`Welcome, ${username}`, 'Confirm your email address to finish setting up your account. The link expires in 24 hours.', { label: 'Confirm email', url }),
  });
}

export async function sendPasswordResetEmail(to: string, url: string) {
  return sendMail({
    to,
    subject: 'Reset your SPEED CHESS password',
    text: `Someone requested a password reset for this address.\n\nReset it here:\n${url}\n\nThe link expires in one hour. If this was not you, no action is needed.`,
    html: baseTemplate('Reset your password', 'Someone requested a password reset for this address. The link expires in one hour. If this was not you, no action is needed.', { label: 'Choose a new password', url }),
  });
}
