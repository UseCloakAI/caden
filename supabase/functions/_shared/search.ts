// Web search for agents: a cycling pool of free-tier Tavily keys (an optional house key from
// TAVILY_API_KEY, plus anyone's donated key), same mechanics as the Groq chat pool. If the
// pool is empty or every key is resting, agents just answer from what they already know —
// search is a tool an agent reaches for, not something every turn depends on.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { markCooldown, markDisabled, markUsed, pickKeys } from './keypool.ts';

const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_KEYS_PER_ATTEMPT = 3;

export interface SearchResult {
  answer: string | null;
  results: Array<{ title: string; url: string; snippet: string }>;
}

interface TavilyResponse {
  answer?: string;
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

async function tryTavilyKey(apiKey: string, query: string): Promise<SearchResult> {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, search_depth: 'basic', include_answer: true, max_results: 5 }),
  });
  if (!res.ok) {
    const err = new Error(`tavily_${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as TavilyResponse;
  return {
    answer: json.answer?.trim() || null,
    results: (json.results ?? [])
      .slice(0, 5)
      .map((r) => ({ title: r.title?.trim() || 'Untitled', url: r.url ?? '', snippet: (r.content ?? '').slice(0, 400).trim() })),
  };
}

/** Searches with the shared Tavily pool. Returns null once every key has failed, is cooling down, or none exist. */
export async function webSearch(db: SupabaseClient, query: string): Promise<SearchResult | null> {
  const keys = await pickKeys(db, 'tavily', Deno.env.get('TAVILY_API_KEY'), MAX_KEYS_PER_ATTEMPT);
  for (const key of keys) {
    try {
      const result = await tryTavilyKey(key.api_key, query);
      await markUsed(db, key.id);
      return result;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) await markDisabled(db, key.id);
      else if (status === 429) await markCooldown(db, key.id, 60);
      else await markCooldown(db, key.id, 15);
    }
  }
  return null;
}

/**
 * Validates a Tavily key before it's stored. Unlike Groq's free /models check, Tavily has no
 * no-cost verification endpoint — this spends one real, minimal search against the key's own
 * quota as the price of confirming it works.
 */
export async function verifyTavilyKey(apiKey: string): Promise<boolean> {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'test', search_depth: 'basic', max_results: 1 }),
  });
  return res.ok;
}
