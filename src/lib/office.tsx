import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Agent, Conversation, Message, Office, Participant, Profile } from './types';

export interface Member {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile: Pick<Profile, 'id' | 'display_name' | 'email'> | null;
}

export interface ConversationWithPeople extends Conversation {
  participants: Participant[];
}

interface OfficeState {
  status: 'loading' | 'none' | 'ready';
  office: Office | null;
  role: 'owner' | 'member' | null;
  members: Member[];
  agents: Agent[];
  conversations: ConversationWithPeople[];
  reload: () => Promise<void>;
  agentById: (id: string | null | undefined) => Agent | undefined;
  memberById: (id: string | null | undefined) => Member | undefined;
}

const OfficeContext = createContext<OfficeState | null>(null);

export function OfficeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [status, setStatus] = useState<OfficeState['status']>('loading');
  const [office, setOffice] = useState<Office | null>(null);
  const [role, setRole] = useState<OfficeState['role']>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<ConversationWithPeople[]>([]);

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data: me } = await supabase.from('office_members').select('office_id, role').eq('user_id', userId).maybeSingle();
    if (!me) {
      setOffice(null);
      setRole(null);
      setStatus('none');
      return;
    }
    const [o, m, a, c] = await Promise.all([
      supabase.from('offices').select('*').eq('id', me.office_id).single(),
      supabase.from('office_members').select('user_id, role, joined_at, profile:profiles(id, display_name, email)').eq('office_id', me.office_id).order('joined_at'),
      supabase.from('agents').select('*').eq('office_id', me.office_id).order('created_at'),
      supabase
        .from('conversations')
        .select('*, participants:conversation_participants(conversation_id, agent_id, user_id)')
        .eq('office_id', me.office_id)
        .order('last_message_at', { ascending: false }),
    ]);
    setOffice(o.data as Office);
    setRole(me.role as OfficeState['role']);
    setMembers((m.data ?? []) as unknown as Member[]);
    setAgents((a.data ?? []) as Agent[]);
    setConversations((c.data ?? []) as ConversationWithPeople[]);
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Any change to the office's roster or threads → debounced reload.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const officeId = office?.id;
  useEffect(() => {
    if (!userId) return;
    const bump = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 250);
    };
    const channel = supabase.channel(`office:${officeId ?? 'none'}:${userId}`);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'office_members', filter: `user_id=eq.${userId}` }, bump);
    if (officeId) {
      for (const table of ['office_members', 'agents', 'conversations'] as const) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `office_id=eq.${officeId}` }, bump);
      }
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants' }, bump);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [officeId, userId, reload]);

  const value = useMemo<OfficeState>(() => {
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const memberMap = new Map(members.map((m) => [m.user_id, m]));
    return {
      status,
      office,
      role,
      members,
      agents,
      conversations,
      reload,
      agentById: (id) => (id ? agentMap.get(id) : undefined),
      memberById: (id) => (id ? memberMap.get(id) : undefined),
    };
  }, [status, office, role, members, agents, conversations, reload]);

  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>;
}

export function useOffice() {
  const ctx = useContext(OfficeContext);
  if (!ctx) throw new Error('useOffice outside OfficeProvider');
  return ctx;
}

/** Messages for one conversation, live. */
export function useThread(conversationId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    setLoading(true);
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!alive) return;
        setMessages(((data ?? []) as Message[]).reverse());
        setLoading(false);
      });
    const channel = supabase
      .channel(`thread:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { messages, loading };
}

/** "4m", "3h", "Yesterday", "Sep 12" — the mono timestamp voice. */
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 172800) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export const AGENT_TONES = [
  'var(--color-periwinkle)',
  'var(--color-horizon)',
  'var(--color-deep-iris)',
  'var(--color-cobalt)',
  'var(--color-iris-gleam)',
  'var(--color-orchid-bloom)',
];
