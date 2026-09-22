import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://usecloakai.github.io', 'http://localhost:5173', 'http://localhost:4173'];

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://usecloakai.github.io/caden/';

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

/** Where links in emails should point: the local dev server if that's where the request came from. */
export function appUrl(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return origin.startsWith('http://localhost') ? `${origin}/caden/` : APP_URL;
}

export const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Maps a `check_rate` failure to a 429; returns null when the call is allowed. */
export async function rateLimit(req: Request, subject: string, action: string) {
  const { error } = await admin().rpc('check_rate', { p_subject: subject, p_action: action });
  if (!error) return null;
  if (error.message === 'rate_limited') return json(req, { error: 'rate_limited', retryAfter: Number(error.hint) || 60 }, 429);
  throw error;
}
