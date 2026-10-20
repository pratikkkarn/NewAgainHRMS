import { z } from 'zod';

/**
 * The emails the system sends. Each template has a parameter schema, so a bad job is refused with a clear
 * reason instead of producing a broken email, and every value is escaped before it goes into the HTML.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** A template that doesn't exist or got the wrong parameters. Retrying can't fix it. */
export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

const Link = z.url().refine((value) => /^https?:\/\//i.test(value), 'must be an http(s) link');

const SCHEMAS = {
  'user-invite': z.object({
    name: z.string().min(1).max(200),
    link: Link,
    expiresInDays: z.number().int().positive(),
    invitedBy: z.string().max(200).optional(),
  }),
  'password-reset': z.object({
    name: z.string().min(1).max(200),
    link: Link,
    expiresInMinutes: z.number().int().positive(),
  }),
  'email-changed': z.object({
    name: z.string().min(1).max(200),
    newEmail: z.string().min(3).max(254),
  }),
} as const;

export type TemplateName = keyof typeof SCHEMAS;
export const TEMPLATE_NAMES = Object.keys(SCHEMAS) as TemplateName[];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A subject is one line, so line breaks (which could be used to inject headers) are removed. */
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

interface Layout {
  heading: string;
  paragraphs: string[];
  button?: { label: string; href: string };
  footnote: string;
}

const BRAND = 'Prime Star HRMS';

function layout({ heading, paragraphs, button, footnote }: Layout): { html: string; text: string } {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${p}</p>`).join('');
  const action = button
    ? `<p style="margin:22px 0;"><a href="${escapeHtml(button.href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;display:inline-block;">${escapeHtml(button.label)}</a></p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#64748b;">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(button.href)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(button.href)}</a></p>`
    : '';
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
<tr><td>
<p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:1px;color:#2563eb;">&#9733; PRIME STAR</p>
<h1 style="margin:0 0 18px;font-size:20px;color:#0f172a;">${escapeHtml(heading)}</h1>
${body}${action}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#94a3b8;">${escapeHtml(footnote)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  // The plain-text version: the paragraphs are HTML built from escaped text, so drop the tags, then undo the escaping.
  const unescape = (value: string): string =>
    value.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const text = [heading, '', ...paragraphs.map(unescape), ...(button ? ['', `${button.label}: ${button.href}`] : []), '', '--', footnote].join('\n');
  return { html, text };
}

export function renderEmail(template: string, params: unknown): RenderedEmail {
  if (!(template in SCHEMAS)) throw new TemplateError(`Unknown email template "${template}".`);
  const name = template as TemplateName;
  const parsed = SCHEMAS[name].safeParse(params);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new TemplateError(`Template "${template}" got bad parameters: ${issue?.path.join('.') || 'params'} ${issue?.message ?? ''}`.trim());
  }

  switch (name) {
    case 'user-invite': {
      const p = parsed.data as z.infer<(typeof SCHEMAS)['user-invite']>;
      const who = p.invitedBy ? `${escapeHtml(p.invitedBy)} has invited you to ${BRAND}.` : `You have been invited to ${BRAND}.`;
      return {
        subject: oneLine(`You're invited to ${BRAND}`),
        ...layout({
          heading: `Welcome, ${p.name.split(' ')[0] ?? p.name}`,
          paragraphs: [`Hi ${escapeHtml(p.name)},`, `${who} Set a password to activate your account.`, `This link works once and expires in ${p.expiresInDays} days.`],
          button: { label: 'Set your password', href: p.link },
          footnote: `If you were not expecting this invitation, you can ignore this email. Nobody can sign in without setting a password through this link.`,
        }),
      };
    }
    case 'password-reset': {
      const p = parsed.data as z.infer<(typeof SCHEMAS)['password-reset']>;
      return {
        subject: oneLine(`Reset your ${BRAND} password`),
        ...layout({
          heading: 'Reset your password',
          paragraphs: [`Hi ${escapeHtml(p.name)},`, `We received a request to reset your ${BRAND} password. Use the button below to choose a new one.`, `This link works once and expires in ${p.expiresInMinutes} minutes.`],
          button: { label: 'Choose a new password', href: p.link },
          footnote: `If you did not ask for this, ignore this email. Your password stays the same until you use the link.`,
        }),
      };
    }
    case 'email-changed': {
      const p = parsed.data as z.infer<(typeof SCHEMAS)['email-changed']>;
      return {
        subject: oneLine(`Your ${BRAND} email address was changed`),
        ...layout({
          heading: 'Your sign-in email was changed',
          paragraphs: [`Hi ${escapeHtml(p.name)},`, `The email address for your ${BRAND} account was changed to <strong>${escapeHtml(p.newEmail)}</strong>. From now on, sign in with that address.`, `If you did not expect this change, tell your administrator straight away.`],
          footnote: `This notice was sent to your previous address.`,
        }),
      };
    }
  }
}
