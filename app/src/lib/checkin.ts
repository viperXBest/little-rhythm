import type { RealtimeChannel } from '@supabase/supabase-js';

import { toLocalDateString } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

// Daily check-in: two fixed questions per parent per local day. RLS shows the
// partner's answers only once you have answered the same day; answers lock
// once submitted. The database checks the shape (mood 1–5, help ≤ 280).

export const MOOD_MIN = 1;
export const MOOD_MAX = 5;
export const HELP_MAX = 280;

export type Checkin = { userId: string; day: string; mood: number; help: string };

/** Today's date on the phone's calendar (its IANA zone), as YYYY-MM-DD. */
export function checkinDay(now = new Date()): string {
  return toLocalDateString(now);
}

function toCheckin(row: { user_id: string; day: string; answers: unknown }): Checkin | null {
  const a = row.answers as { mood?: unknown; help?: unknown } | null;
  if (!a || typeof a.mood !== 'number' || typeof a.help !== 'string') return null;
  return { userId: row.user_id, day: row.day, mood: a.mood, help: a.help };
}

/** The day's check-ins this user may see (their own; the partner's once they answered), or null. */
export async function fetchCheckins(familyId: string, day: string): Promise<Checkin[] | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('user_id, day, answers')
    .eq('family_id', familyId)
    .eq('day', day);
  if (error) return null;
  return (data ?? []).map(toCheckin).filter((c): c is Checkin => c !== null);
}

export type SubmitResult = 'ok' | 'already_answered' | 'error';

export async function submitCheckin(input: {
  familyId: string;
  userId: string;
  day: string;
  mood: number;
  help: string;
}): Promise<SubmitResult> {
  const { error } = await supabase.from('checkins').insert({
    family_id: input.familyId,
    user_id: input.userId,
    day: input.day,
    answers: { mood: input.mood, help: input.help.trim().slice(0, HELP_MAX) },
  });
  if (!error) return 'ok';
  return error.code === '23505' ? 'already_answered' : 'error';
}

/**
 * Calls onChange when a check-in in the family is inserted and visible to
 * this user (realtime applies RLS: the partner's answers arrive only once you
 * answered that day). Returns an unsubscribe function.
 */
export function subscribeCheckins(familyId: string, onChange: () => void): () => void {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  void (async () => {
    await supabase.realtime.setAuth();
    if (cancelled) return;
    channel = supabase
      .channel(`checkins:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'checkins', filter: `family_id=eq.${familyId}` },
        () => onChange(),
      )
      .subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
