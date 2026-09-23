// Generic cycling key pool, shared by every free-tier provider (Groq for chat, Tavily for
// search): an optional house key from an env var, plus anyone's donated key, tried
// oldest-used-first, cooling down or disabling on failure. One `provider_keys` table, one
// column telling rows apart.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface PoolKey {
  id: string;
  api_key: string;
}

/** Ensures an env house key (if set and not already stored) is in the pool, then returns the ordered attempt list. */
export async function pickKeys(db: SupabaseClient, provider: string, houseKey: string | undefined, limit: number): Promise<PoolKey[]> {
  if (houseKey) {
    const { data: existing } = await db.from('provider_keys').select('id').eq('provider', provider).eq('api_key', houseKey).maybeSingle();
    if (!existing) await db.from('provider_keys').insert({ provider, api_key: houseKey, label: 'house' });
  }
  const { data } = await db
    .from('provider_keys')
    .select('id, api_key')
    .eq('provider', provider)
    .eq('enabled', true)
    .or('cooldown_until.is.null,cooldown_until.lte.now()')
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data ?? []) as PoolKey[];
}

export async function markUsed(db: SupabaseClient, id: string) {
  await db.from('provider_keys').update({ last_used_at: new Date().toISOString(), consecutive_failures: 0 }).eq('id', id);
}

export async function markCooldown(db: SupabaseClient, id: string, seconds: number) {
  await db.from('provider_keys').update({ cooldown_until: new Date(Date.now() + seconds * 1000).toISOString() }).eq('id', id);
}

export async function markDisabled(db: SupabaseClient, id: string) {
  await db.from('provider_keys').update({ enabled: false }).eq('id', id);
}
