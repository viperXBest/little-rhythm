import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Tables } from '@/lib/database.types';
import type { GrowthKind } from '@/lib/growth-values';
import { supabase } from '@/lib/supabase';

export type GrowthRow = Tables<'growth_measurements'>;

/** Columns members may change after insert (the DB grants update on these only). */
export type GrowthPatch = Partial<Pick<GrowthRow, 'value' | 'measured_on'>>;

type Rows = ReadonlyMap<string, GrowthRow>;

export type Growth = {
  rows: GrowthRow[];
  status: 'loading' | 'ready' | 'error';
  find: (id: string) => GrowthRow | undefined;
  refresh: () => Promise<void>;
  /** The server assigns the id and the author, so the row appears once it is saved. */
  add: (input: { kind: GrowthKind; value: number; measuredOn: string }) => Promise<'failed' | null>;
  update: (id: string, patch: GrowthPatch) => Promise<'failed' | null>;
  remove: (id: string) => Promise<'failed' | null>;
};

function withRow(rows: Rows, row: GrowthRow): Rows {
  const next = new Map(rows);
  next.set(row.id, row);
  return next;
}

function withoutRow(rows: Rows, id: string): Rows {
  if (!rows.has(id)) return rows;
  const next = new Map(rows);
  next.delete(id);
  return next;
}

/** Every measurement of the baby, or null on failure. A baby has a few dozen at most. */
async function fetchGrowth(babyId: string): Promise<GrowthRow[] | null> {
  const { data, error } = await supabase
    .from('growth_measurements')
    .select('*')
    .eq('baby_id', babyId)
    .order('measured_on', { ascending: false })
    .limit(500);
  return error ? null : data;
}

/**
 * The baby's growth records, kept in sync between the two phones over realtime (the same pattern as
 * today-events.tsx). Rows are keyed by id, so a write and its realtime echo merge instead of duplicating.
 * Only this screen reads the table; no Edge Function does and nothing here goes to the AI.
 */
export function useGrowth(babyId: string): Growth {
  const [rows, setRows] = useState<Rows>(new Map());
  const [status, setStatus] = useState<Growth['status']>('loading');

  const apply = useCallback((fromServer: GrowthRow[] | null) => {
    if (!fromServer) {
      setStatus((prev) => (prev === 'ready' ? prev : 'error'));
      return;
    }
    setRows(new Map(fromServer.map((row) => [row.id, row])));
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    apply(await fetchGrowth(babyId));
  }, [apply, babyId]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      // Subscribe with the user's JWT so RLS applies to the stream.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const filter = `baby_id=eq.${babyId}`;
      channel = supabase
        .channel(`growth:${babyId}`)
        .on<GrowthRow>(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'growth_measurements', filter },
          (payload) => setRows((prev) => withRow(prev, payload.new)),
        )
        .on<GrowthRow>(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'growth_measurements', filter },
          (payload) => setRows((prev) => withRow(prev, payload.new)),
        )
        // DELETE can't be filtered and carries only the id: drop it if we have it.
        .on<GrowthRow>(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'growth_measurements' },
          (payload) => {
            const id = payload.old.id;
            if (id) setRows((prev) => withoutRow(prev, id));
          },
        )
        .subscribe((state) => {
          // Covers anything missed before (re)subscribing.
          if (state === 'SUBSCRIBED') void refresh();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [babyId, refresh]);

  useEffect(() => {
    let cancelled = false;
    void fetchGrowth(babyId).then((result) => {
      if (!cancelled) apply(result);
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [apply, babyId, refresh]);

  const add = useCallback(
    async (input: { kind: GrowthKind; value: number; measuredOn: string }) => {
      // created_by and created_at come from the database; id too (the column grant leaves it out).
      const { data, error } = await supabase
        .from('growth_measurements')
        .insert({ baby_id: babyId, kind: input.kind, value: input.value, measured_on: input.measuredOn })
        .select('*')
        .single();
      if (error || !data) return 'failed' as const;
      setRows((prev) => withRow(prev, data));
      return null;
    },
    [babyId],
  );

  const update = useCallback(
    async (id: string, patch: GrowthPatch) => {
      const before = rows.get(id);
      if (!before) return 'failed' as const;
      // Sends only the mutable columns; any other column would fail the column grant.
      const body: GrowthPatch = {};
      if (patch.value !== undefined) body.value = patch.value;
      if (patch.measured_on !== undefined) body.measured_on = patch.measured_on;
      setRows((prev) => withRow(prev, { ...before, ...body }));
      const { error } = await supabase.from('growth_measurements').update(body).eq('id', id);
      if (error) {
        setRows((prev) => (prev.has(id) ? withRow(prev, before) : prev));
        return 'failed' as const;
      }
      return null;
    },
    [rows],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = rows.get(id);
      if (!before) return null;
      setRows((prev) => withoutRow(prev, id));
      const { error } = await supabase.from('growth_measurements').delete().eq('id', id);
      if (error) {
        setRows((prev) => withRow(prev, before));
        return 'failed' as const;
      }
      return null;
    },
    [rows],
  );

  return {
    rows: [...rows.values()],
    status,
    find: (id) => rows.get(id),
    refresh,
    add,
    update,
    remove,
  };
}
