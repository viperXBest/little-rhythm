import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth storage backed by expo-secure-store (Android Keystore).
 * Sessions can exceed what some keystores accept in one entry, so values are
 * split into chunks stored as `key.0`, `key.1`, … plus a `key.chunks` count.
 */

// Characters, not bytes; kept small so multi-byte metadata stays well under 2 KB.
const CHUNK_SIZE = 600;

const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const count = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function deleteChunks(key: string, from: number, to: number): Promise<void> {
  const deletions: Promise<void>[] = [];
  for (let i = from; i < to; i++) deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  await Promise.all(deletions);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    // A missing chunk means a torn write; treat the session as absent.
    if (parts.some((part) => part === null)) return null;
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = await readCount(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    await deleteChunks(key, chunks.length, previous);
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key));
    await deleteChunks(key, 0, count);
  },
};
