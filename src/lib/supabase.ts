import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Calls an Edge Function and returns its JSON body, whatever the status. */
export async function callFunction<T = Record<string, unknown>>(name: string, body?: Record<string, unknown>): Promise<T & { error?: string }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T & { error?: string };
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      return (await context.json()) as T & { error?: string };
    } catch {
      /* fall through */
    }
  }
  return { error: error.message } as T & { error?: string };
}
