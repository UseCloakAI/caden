// Emails a verification link. Accounts must verify within an hour of signing up.
import { admin, appUrl, cors, json, rateLimit, sha256 } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });

  const db = admin();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user?.email) return json(req, { error: 'not_signed_in' }, 401);

  const { data: profile } = await db.from('profiles').select('email_verified_at').eq('id', user.id).single();
  if (profile?.email_verified_at) return json(req, { status: 'verified' });

  const limited = await rateLimit(req, user.id, 'verify_email');
  if (limited) return limited;

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json(req, { error: 'email_not_configured' }, 503);

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  const { error } = await db.from('email_verifications').upsert({
    user_id: user.id,
    token_hash: await sha256(token),
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  });
  if (error) throw error;

  const link = `${appUrl(req)}#/verify/${token}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Caden <no-reply@usecloak.org>',
      to: user.email,
      subject: 'Verify your email for Caden',
      text: `Confirm this address to keep using Caden:\n\n${link}\n\nThe link works for 24 hours. If you did not sign up, ignore this email.`,
      html: `<p>Confirm this address to keep using Caden.</p><p><a href="${link}">Verify email</a></p><p style="color:#6a6b6b">The link works for 24 hours. If you did not sign up, ignore this email.</p>`,
    }),
  });
  if (!res.ok) {
    console.error('resend failed', res.status, await res.text());
    return json(req, { error: 'email_failed' }, 502);
  }
  return json(req, { status: 'sent' });
});
