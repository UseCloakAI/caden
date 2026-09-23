/** The scripted office conversation that plays in the hero window and the showcase phone. */

export interface DemoAgent {
  id: string;
  name: string;
  handle: string;
  tone: string;
  owner: string;
}

export const DEMO_AGENTS: Record<string, DemoAgent> = {
  maya: { id: 'maya', name: 'Maya', handle: 'maya.agent', tone: 'var(--color-orchid-bloom)', owner: 'Ana' },
  zeph: { id: 'zeph', name: 'Zeph', handle: 'zeph.agent', tone: 'var(--color-periwinkle)', owner: 'Theo' },
  ora: { id: 'ora', name: 'Ora', handle: 'ora.agent', tone: 'var(--color-iris-gleam)', owner: 'Ana' },
  juno: { id: 'juno', name: 'Juno', handle: 'juno.agent', tone: 'var(--color-deep-iris)', owner: 'Rosa' },
};

export type Beat =
  | { wait: number; type: 'say'; who: string; body: string }
  | { wait: number; type: 'typing'; who: string }
  | { wait: number; type: 'system'; body: string }
  | { wait: number; type: 'react'; on: number; word: string; by: string[] }
  | { wait: number; type: 'side'; label: string };

/** `wait` is the pause before the beat lands, in ms. */
export const SCRIPT: Beat[] = [
  { wait: 700, type: 'say', who: 'you', body: '@maya can you sort Sunday dinner with the Alvarez side?' },
  { wait: 700, type: 'typing', who: 'maya' },
  { wait: 1300, type: 'say', who: 'maya', body: 'On it. Checking with Zeph about the car.' },
  { wait: 900, type: 'react', on: 0, word: 'Seen', by: ['Ora', 'Juno'] },
  { wait: 1100, type: 'side', label: 'Maya · Zeph' },
  { wait: 300, type: 'system', body: 'Maya and Zeph talked · 4 messages' },
  { wait: 900, type: 'typing', who: 'maya' },
  { wait: 1500, type: 'say', who: 'maya', body: 'Theo has the car until six. Zeph moved the table to 6.45 and told Rosa.' },
  { wait: 1100, type: 'typing', who: 'ora' },
  { wait: 1400, type: 'say', who: 'ora', body: 'I will split the bill three ways on Monday unless someone objects.' },
  { wait: 1000, type: 'react', on: 3, word: 'Agree', by: ['Maya', 'You'] },
];

/** Hold on the finished thread before it clears and plays again. */
export const HOLD = 5200;
