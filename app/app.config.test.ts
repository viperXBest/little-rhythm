// Run under Deno: npx -y deno@2 test app/app.config.test.ts
import { assertEquals, assertThrows } from 'jsr:@std/assert@1.0.13';

import { checkSupabaseEnv, isEasCliPreRead } from './app.config.ts';

const HOSTED = 'https://abcdefghijklmnopqrst.supabase.co';
const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;
const env = (url?: string, anonKey?: string) => ({
  EXPO_PUBLIC_SUPABASE_URL: url,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
});

Deno.test('missing values fail with their names', () => {
  assertThrows(() => checkSupabaseEnv(env(undefined, undefined), 'production'), Error, 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  assertThrows(() => checkSupabaseEnv(env(HOSTED, ' '), undefined), Error, 'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
});

Deno.test('only an anon or publishable key is accepted', () => {
  assertEquals(checkSupabaseEnv(env(HOSTED, 'sb_publishable_x'), 'production').url, HOSTED);
  assertEquals(checkSupabaseEnv(env(HOSTED, jwt({ role: 'anon' })), 'production').url, HOSTED);
  assertThrows(() => checkSupabaseEnv(env(HOSTED, jwt({ role: 'service_role' })), undefined), Error, 'role "service_role"');
  assertThrows(() => checkSupabaseEnv(env(HOSTED, 'sb_secret_x'), undefined), Error, 'a secret key');
  assertThrows(() => checkSupabaseEnv(env(HOSTED, 'not-a-key'), undefined), Error, 'an unknown key');
});

Deno.test('production needs the hosted https URL; other profiles may use the local stack', () => {
  const key = jwt({ role: 'anon' });
  assertThrows(() => checkSupabaseEnv(env('http://10.0.2.2:54321', key), 'production'), Error, 'hosted project');
  assertThrows(() => checkSupabaseEnv(env('http://abcdefghijklmnopqrst.supabase.co', key), 'production'), Error);
  assertEquals(checkSupabaseEnv(env('http://10.0.2.2:54321', key), 'development').url, 'http://10.0.2.2:54321');
  assertEquals(checkSupabaseEnv(env('http://192.168.1.20:54321', key), undefined).url, 'http://192.168.1.20:54321');
  assertThrows(() => checkSupabaseEnv(env('not a url', key), undefined), Error, 'not a URL');
});

Deno.test('only eas-cli’s local pre-read (no .env, no values, not on the worker) skips the check', () => {
  assertEquals(isEasCliPreRead({ EXPO_NO_DOTENV: '1' }), true);
  // The build worker always checks.
  assertEquals(isEasCliPreRead({ EXPO_NO_DOTENV: '1', EAS_BUILD: 'true' }), false);
  // A local expo command (dotenv on) always checks.
  assertEquals(isEasCliPreRead({}), false);
  // Once any value is present, it is checked (a secret key is never let through).
  assertEquals(isEasCliPreRead({ EXPO_NO_DOTENV: '1', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_x' }), false);
});
