// Adds a signed-in user's Groq key to the shared, cycling free-tier pool. Validated before
// it's stored (a free /models call, no completion cost); never readable back through any API.
import { admin, cors, json, rateLimit } from '../_shared/http.ts';
import { verifyGroqKey } from '../_shared/providers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });

  const db = admin();
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json(req, { error: 'not_signed_in' }, 401);

  const limited = await rateLimit(req, user.id, 'donate_key');
  if (limited) return limited;

  const { api_key } = await req.json().catch(() => ({ api_key: null }));
  if (typeof api_key !== 'string' || api_key.trim().length < 10) return json(req, { error: 'invalid_provider_key' }, 400);

  const ok = await verifyGroqKey(api_key.trim());
  if (!ok) return json(req, { error: 'invalid_provider_key' }, 400);

  const { error } = await db.from('provider_keys').insert({ provider: 'groq', api_key: api_key.trim(), donated_by: user.id, label: user.email ?? null });
  if (error) {
    console.error('donate-key insert failed', error.message);
    return json(req, { error: 'donate_failed' }, 500);
  }
  return json(req, { status: 'added' });
});
