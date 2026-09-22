import { useState } from 'react';

/** Chromatic grounds light enough that ink flips to Void. */
export const LIGHT_GROUNDS = ['var(--color-pale-iris)', 'var(--color-periwinkle)', 'var(--color-orchid-bloom)'];

export const isLightGround = (tone?: string) => tone != null && LIGHT_GROUNDS.includes(tone);

export function useHover() {
  const [hover, setHover] = useState(false);
  return { hover, bind: { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } };
}
