// Static config lives in app.json. This file only refuses to build without the
// public Supabase values: a build (or any expo command) fails with a clear
// message instead of shipping an APK without a URL, or with a secret key.
// No imports (Expo's config loader can't require other .ts files, and
// app.config.test.ts runs this under Deno).

type ExpoConfig = Record<string, unknown>;

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  checkSupabaseEnv(process.env, process.env.EAS_BUILD_PROFILE);
  return config;
};

export type SupabaseEnv = { url: string; anonKey: string };

const HOSTED = /^[a-z0-9]{20}\.supabase\.co$/;

/** The JWT payload's role, or null when the key is not a JWT. */
function jwtRole(key: string): string | null {
  const part = key.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const role: unknown = JSON.parse(json).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * Returns the values, or throws with what to fix. `profile` is EAS_BUILD_PROFILE:
 * a production build must use the hosted project over https.
 */
export function checkSupabaseEnv(
  env: Record<string, string | undefined>,
  profile: string | undefined,
): SupabaseEnv {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing = [
    url ? null : 'EXPO_PUBLIC_SUPABASE_URL',
    anonKey ? null : 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((name): name is string => name !== null);
  if (!url || !anonKey) {
    throw new Error(
      `Missing ${missing.join(' and ')}. Set it in app/.env for local runs, or in the EAS ` +
        `environment for builds (eas env:list --environment production).`,
    );
  }

  // Only the public key may go into the app: never a secret or service-role key.
  const role = jwtRole(anonKey);
  const publishable = anonKey.startsWith('sb_publishable_');
  if (!publishable && role !== 'anon') {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY must be the anon or publishable key ' +
        `(found ${anonKey.startsWith('sb_secret_') ? 'a secret key' : role ? `role "${role}"` : 'an unknown key'}).`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not a URL.');
  }
  if (profile === 'production' && (parsed.protocol !== 'https:' || !HOSTED.test(parsed.hostname))) {
    throw new Error(
      'A production build must use the hosted project: EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co.',
    );
  }
  return { url, anonKey };
}
