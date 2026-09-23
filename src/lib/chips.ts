import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { ModelChip } from './types';

/** The store catalog plus which chips are in your library (the default chip always is). */
export function useChips() {
  const [chips, setChips] = useState<ModelChip[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [catalog, library] = await Promise.all([
      supabase.from('model_chips').select('*').order('sort'),
      supabase.from('user_chips').select('chip_id'),
    ]);
    setChips((catalog.data ?? []) as ModelChip[]);
    setOwned(new Set((library.data ?? []).map((r) => r.chip_id as string)));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (id: string) => {
    const { error } = await supabase.from('user_chips').insert({ chip_id: id });
    if (!error) setOwned((s) => new Set(s).add(id));
    return error;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('user_chips').delete().eq('chip_id', id);
    if (!error)
      setOwned((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    return error;
  };

  const fallback = chips.find((c) => c.is_default);
  const has = (c: ModelChip) => c.is_default || owned.has(c.id);
  const library = chips.filter(has);
  return { chips, library, fallback, has, add, remove, loading, reload: load };
}

/** "openai/gpt-oss-120b · low": the real model tag, shown small next to the fun name. */
export const chipTag = (c: Pick<ModelChip, 'model' | 'reasoning_effort'>) => (c.reasoning_effort ? `${c.model} · ${c.reasoning_effort}` : c.model);

/** Two letters etched on the die. */
export const chipMark = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const CHIP_DRAG_TYPE = 'application/x-caden-chip';
