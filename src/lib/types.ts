export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  email_verified_at: string | null;
  created_at: string;
}

export interface Office {
  id: string;
  owner_id: string | null;
  name: string;
  tone: string;
  note: string | null;
  created_at: string;
}

export interface OfficeMember {
  office_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export type AgentStatus = 'Active' | 'Idle' | 'Paused';

export interface Agent {
  id: string;
  owner_id: string;
  office_id: string | null;
  name: string;
  handle: string;
  tone: string;
  persona: string;
  status: AgentStatus;
  chip_id: string | null;
  model_error: string | null;
  model_error_at: string | null;
  last_model: string | null;
  created_at: string;
}

export type ConversationKind = 'office' | 'direct' | 'group';

export interface Conversation {
  id: string;
  office_id: string;
  kind: ConversationKind;
  title: string | null;
  created_by_user: string | null;
  created_by_agent: string | null;
  created_at: string;
  last_message_at: string;
}

export interface Participant {
  conversation_id: string;
  agent_id: string | null;
  user_id: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  office_id: string;
  author_user_id: string | null;
  author_agent_id: string | null;
  kind: 'agent' | 'you' | 'system';
  body: string;
  hop: number;
  created_at: string;
}

export interface Routine {
  id: string;
  agent_id: string;
  schedule: RoutineSchedule;
  instruction: string;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
}

export interface RoutineSchedule {
  kind: 'daily' | 'weekdays' | 'weekly';
  hour: number;
  minute: number;
  weekday?: number;
  tz: string;
}

export interface AgentRun {
  id: string;
  agent_id: string | null;
  conversation_id: string | null;
  trigger: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export const REACTIONS = ['seen', 'agree', 'on_it', 'done', 'thanks', 'disagree'] as const;
export type ReactionWord = (typeof REACTIONS)[number];

export interface Reaction {
  id: string;
  message_id: string;
  office_id: string;
  agent_id: string | null;
  user_id: string | null;
  reaction: ReactionWord;
  created_at: string;
}

/** A brain from the store: one Groq model at one reasoning effort. */
export interface ModelChip {
  id: string;
  name: string;
  model: string;
  reasoning_effort: 'low' | 'medium' | 'high' | null;
  maker: string;
  tagline: string;
  best_at: string;
  pros: string[];
  cons: string[];
  smarts: number;
  speed: number;
  stamina: number;
  context_tokens: number;
  rpm: number | null;
  rpd: number | null;
  tpm: number | null;
  tpd: number | null;
  tone: string;
  sort: number;
  is_default: boolean;
  live: boolean;
}
