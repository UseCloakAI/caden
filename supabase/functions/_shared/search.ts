// Web search for agents: a cycling pool of free-tier Tavily keys (an optional house key from
// TAVILY_API_KEY, plus anyone's donated key), same mechanics as the Groq chat pool. If the
// pool is empty or every key is resting, agents just answer from what they already know —
// search is a tool an agent reaches for, not something every turn depends on.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { markCooldown, markDisabled, markUsed, pickKeys } from './keypool.ts';

const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
/** A page's readable text is cut here; enough to answer from, small enough for a free-tier prompt. */
const PAGE_CHARS = 4500;
const MAX_KEYS_PER_ATTEMPT = 3;

export interface SearchResult {
  answer: string | null;
  results: Array<{ title: string; url: string; snippet: string }>;
}

export interface SearchOptions {
  /** Only results from the last day / week / month / year. */
  freshness?: 'day' | 'week' | 'month' | 'year';
  /** Restrict to one site, e.g. "zillow.com". */
  site?: string;
}

export interface PageResult {
  url: string;
  title: string | null;
  text: string;
  truncated: boolean;
}

interface TavilyResponse {
  answer?: string;
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

async function tryTavilyKey(apiKey: string, query: string, options: SearchOptions): Promise<SearchResult> {
  const site = options.site?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 5,
      ...(options.freshness ? { time_range: options.freshness } : {}),
      ...(site ? { include_domains: [site] } : {}),
    }),
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
export async function webSearch(db: SupabaseClient, query: string, options: SearchOptions = {}): Promise<SearchResult | null> {
  return withTavilyKey(db, (apiKey) => tryTavilyKey(apiKey, query, options));
}

/** "usecloak.org", "https://x.com/a?b" → a fetchable https URL, or null for anything that isn't a public web address. */
export function normalizeUrl(raw: string): string | null {
  let text = raw.trim().replace(/[)>.,;]+$/, '');
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function tryTavilyExtract(apiKey: string, url: string): Promise<PageResult> {
  const res = await fetch(TAVILY_EXTRACT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], extract_depth: 'basic' }),
  });
  if (!res.ok) {
    const err = new Error(`tavily_${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as { results?: Array<{ url?: string; title?: string; raw_content?: string }> };
  const page = json.results?.[0];
  const text = (page?.raw_content ?? '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw Object.assign(new Error('page_unreadable'), { status: 422 });
  return { url: page?.url ?? url, title: page?.title?.trim() || null, text: text.slice(0, PAGE_CHARS), truncated: text.length > PAGE_CHARS };
}

/** Reads one page's text with the Tavily pool. null when it can't be read (blocked, empty, pool down). */
export async function readPage(db: SupabaseClient, url: string): Promise<PageResult | null> {
  return withTavilyKey(db, (apiKey) => tryTavilyExtract(apiKey, url));
}

/** Tries the pool's keys in turn; benches the ones that fail. A page that can't be read isn't the key's fault. */
async function withTavilyKey<T>(db: SupabaseClient, run: (apiKey: string) => Promise<T>): Promise<T | null> {
  const keys = await pickKeys(db, 'tavily', Deno.env.get('TAVILY_API_KEY'), MAX_KEYS_PER_ATTEMPT);
  for (const key of keys) {
    try {
      const result = await run(key.api_key);
      await markUsed(db, key.id);
      return result;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 400 || status === 422) return null; // a bad or unreadable URL, not a bad key
      if (status === 401 || status === 403) await markDisabled(db, key.id);
      else if (status === 429 || status === 432 || status === 433) await markCooldown(db, key.id, status === 429 ? 60 : 3600);
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
