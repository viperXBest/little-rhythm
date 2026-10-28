import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type PairError =
  | 'invalid_or_expired_code'
  | 'already_in_family'
  | 'family_full'
  | 'not_in_family'
  | 'rate_limited'
  | 'unknown';

type PairResult<T> = { ok: true; data: T } | { ok: false; error: PairError };

const KNOWN: readonly PairError[] = [
  'invalid_or_expired_code',
  'already_in_family',
  'family_full',
  'not_in_family',
  'rate_limited',
];

export const pairErrorMessage: Record<PairError, string> = {
  invalid_or_expired_code: 'That code is invalid or expired. Ask your partner for a new one.',
  already_in_family: 'You are already part of a family.',
  family_full: 'This family already has two parents.',
  not_in_family: 'Create a family first.',
  rate_limited: 'Too many attempts. Try again in a few minutes.',
  unknown: 'Something went wrong. Check your connection and try again.',
};

async function invokePair<T>(body: Record<string, string>): Promise<PairResult<T>> {
  const { data, error } = await supabase.functions.invoke<T>('pair', { body });
  if (!error && data) return { ok: true, data };
  if (error instanceof FunctionsHttpError) {
    try {
      const payload: unknown = await error.context.json();
      if (payload && typeof payload === 'object' && 'error' in payload) {
        const code = (payload as { error: unknown }).error;
        const match = KNOWN.find((known) => known === code);
        if (match) return { ok: false, error: match };
      }
    } catch {
      // Fall through to unknown.
    }
  }
  return { ok: false, error: 'unknown' };
}

export function createPairCode() {
  return invokePair<{ code: string; expires_at: string }>({ action: 'create' });
}

export function redeemPairCode(code: string) {
  return invokePair<{ family_id: string }>({ action: 'redeem', code });
}
