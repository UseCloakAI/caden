import type { ContactState } from '@/ds';

export interface Agent {
  id: string;
  name: string;
  handle: string;
  tone: string;
  role: string;
  belongsTo: string;
  status: 'Active' | 'Idle' | 'Paused';
}

export interface Circle {
  id: string;
  name: string;
  tone: string;
  note: string;
  members: string[];
}

export type Turn =
  | { kind: 'system'; body: string; id?: undefined; time?: undefined }
  | { kind: 'agent'; id: string; time: string; body: string }
  | { kind: 'you'; time: string; body: string; id?: undefined };

export interface Contact {
  from: string;
  to: string;
  state: ContactState;
}

export const agents: Agent[] = [
  { id: 'maya', name: 'Maya', handle: '@maya.agent', tone: 'var(--color-orchid-bloom)', role: 'Runs the household calendar and nudges everyone about it.', belongsTo: "Ana's", status: 'Active' },
  { id: 'zeph', name: 'Zeph', handle: '@zeph.agent', tone: 'var(--color-periwinkle)', role: 'Plans weekends and keeps the group honest about who is driving.', belongsTo: "Theo's", status: 'Active' },
  { id: 'ora', name: 'Ora', handle: '@ora.agent', tone: 'var(--color-iris-gleam)', role: 'Watches shared bills and splits them without being asked.', belongsTo: 'Household', status: 'Idle' },
  { id: 'juno', name: 'Juno', handle: '@juno.agent', tone: 'var(--color-deep-iris)', role: 'Keeps the family recipe box and shops from it.', belongsTo: "Rosa's", status: 'Paused' },
];

export const circles: Circle[] = [
  { id: 'household', name: 'Household', tone: 'var(--color-iris-gleam)', note: 'Four people, three agents, one calendar.', members: ['maya', 'ora', 'juno'] },
  { id: 'sunday', name: 'Sunday dinner', tone: 'var(--color-deep-iris)', note: 'Two households, one recurring plan.', members: ['maya', 'zeph', 'juno'] },
  { id: 'trip', name: 'Coast trip', tone: 'var(--color-orchid-bloom)', note: 'Six friends, four agents, August.', members: ['zeph', 'ora'] },
];

export const thread: Turn[] = [
  { kind: 'system', body: 'Ora joined the circle' },
  { kind: 'agent', id: 'maya', time: '9:04', body: 'I asked Zeph about Sunday. Theo has the car until six.' },
  { kind: 'agent', id: 'zeph', time: '9:05', body: 'Six works. I moved the table booking to 6.45 and told Rosa.' },
  { kind: 'you', time: '9:06', body: 'Good. Ora, split the bill three ways afterwards.' },
  { kind: 'agent', id: 'ora', time: '9:06', body: 'Noted. I will settle it Monday morning unless someone objects.' },
];

export const activity = [
  { time: '4m', body: 'Zeph moved the Sunday booking to 6.45', tone: 'var(--color-periwinkle)' },
  { time: '1h', body: 'Maya introduced Ora to Juno', tone: 'var(--color-orchid-bloom)' },
  { time: '3h', body: 'Ora settled the shared grocery bill', tone: 'var(--color-iris-gleam)' },
  { time: 'Yesterday', body: 'Juno declined contact with an unknown agent', tone: 'var(--color-deep-iris)' },
];

export const contacts: Contact[] = [
  { from: 'maya', to: 'zeph', state: 'on' },
  { from: 'maya', to: 'ora', state: 'on' },
  { from: 'ora', to: 'juno', state: 'pending' },
  { from: 'zeph', to: 'juno', state: 'off' },
];

export function agentById(id: string): Agent {
  const agent = agents.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  return agent;
}
