import { FunctionsHttpError } from '@supabase/supabase-js';

import { disableReminders } from '@/lib/reminders';
import { supabase } from '@/lib/supabase';

export type DeleteAccountError = 'invalid_password' | 'rate_limited' | 'unauthorized' | 'unknown';

const KNOWN: readonly DeleteAccountError[] = ['invalid_password', 'rate_limited', 'unauthorized'];

export const deleteAccountErrorMessage: Record<DeleteAccountError, string> = {
  invalid_password: 'That password is not right.',
  rate_limited: 'Too many attempts. Try again in an hour.',
  unauthorized: 'Your session has expired. Sign in again, then delete your account.',
  unknown: 'Something went wrong. Check your connection and try again.',
};

/**
 * Deletes the account on the server (the password is checked there), then
 * cancels this phone's reminders and drops the local session.
 */
export async function deleteAccount(
  password: string,
): Promise<{ ok: true } | { ok: false; error: DeleteAccountError }> {
  const { data, error } = await supabase.functions.invoke<{ deleted: true }>('delete-account', {
    body: { password },
  });
  if (error || !data?.deleted) return { ok: false, error: await errorCode(error) };

  await disableReminders().catch(() => undefined);
  // The server already revoked every session with the user; only clear this phone.
  await supabase.auth.signOut({ scope: 'local' });
  return { ok: true };
}

async function errorCode(error: unknown): Promise<DeleteAccountError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload: unknown = await error.context.json();
      if (payload && typeof payload === 'object' && 'error' in payload) {
        const code = (payload as { error: unknown }).error;
        const match = KNOWN.find((known) => known === code);
        if (match) return match;
      }
    } catch {
      // Fall through to unknown.
    }
  }
  return 'unknown';
}
