import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

export type Family = {
  id: string;
  memberCount: number;
  baby: { id: string; name: string; birthDate: string };
};

type SessionState = {
  session: Session | null;
  family: Family | null;
  /** True until the stored session (and its family, if any) has been loaded. */
  loading: boolean;
  /** Set when the family could not be loaded (e.g. offline). */
  familyError: boolean;
  refreshFamily: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

async function fetchFamily(): Promise<Family | null> {
  // RLS returns only the caller's own family rows.
  const [babyResult, membersResult] = await Promise.all([
    supabase.from('babies').select('id, name, birth_date, family_id').limit(1).maybeSingle(),
    supabase.from('family_members').select('user_id', { count: 'exact', head: true }),
  ]);
  if (babyResult.error) throw babyResult.error;
  if (membersResult.error) throw membersResult.error;
  const baby = babyResult.data;
  if (!baby) return null;
  return {
    id: baby.family_id,
    memberCount: membersResult.count ?? 1,
    baby: { id: baby.id, name: baby.name, birthDate: baby.birth_date },
  };
}

// Family state is tagged with the user it was loaded for, so a different
// (or signed-out) user never sees a stale family.
type FamilyState = { userId: string; family: Family | null; error: boolean };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [familyState, setFamilyState] = useState<FamilyState | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    // Do not call other supabase methods inside this callback (auth lock).
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const applyResult = useCallback((forUser: string, result: Family | null | Error) => {
    if (result instanceof Error) {
      setFamilyState((prev) => ({
        userId: forUser,
        family: prev?.userId === forUser ? prev.family : null,
        error: true,
      }));
    } else {
      setFamilyState({ userId: forUser, family: result, error: false });
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchFamily()
      .catch((e: unknown) => (e instanceof Error ? e : new Error('family load failed')))
      .then((result) => {
        if (!cancelled) applyResult(userId, result);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, applyResult]);

  const refreshFamily = useCallback(async () => {
    if (!userId) return;
    const result = await fetchFamily().catch((e: unknown) =>
      e instanceof Error ? e : new Error('family load failed'),
    );
    applyResult(userId, result);
  }, [userId, applyResult]);

  const current = familyState !== null && familyState.userId === userId ? familyState : null;
  const family = current?.family ?? null;
  const familyError = current?.error ?? false;
  const loading = sessionLoading || (userId !== null && current === null);

  return (
    <SessionContext.Provider value={{ session, family, loading, familyError, refreshFamily }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
