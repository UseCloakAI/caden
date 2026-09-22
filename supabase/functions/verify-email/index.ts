// Consumes a verification token. Public (no JWT) so the link works on any device.
import { admin, cors, json, sha256 } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const { token } = await req.json().catch(() => ({ token: null }));
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return json(req, { error: 'invalid_token' }, 400);

  const db = admin();
  const { data: row } = await db
    .from('email_verifications')
    .select('user_id, expires_at')
    .eq('token_hash', await sha256(token))
    .maybeSingle();
  if (!row) return json(req, { error: 'invalid_token' }, 400);
  if (new Date(row.expires_at) < new Date()) return json(req, { error: 'expired_token' }, 410);

  const { error } = await db.from('profiles').update({ email_verified_at: new Date().toISOString() }).eq('id', row.user_id);
  if (error) throw error;
  await db.from('email_verifications').delete().eq('user_id', row.user_id);
  return json(req, { status: 'verified' });
});
