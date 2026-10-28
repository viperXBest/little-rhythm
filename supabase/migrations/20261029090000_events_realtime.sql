-- Day 3: event integrity for tracking, and realtime for events and family_members.
-- Type check, ended_at >= started_at, created_by default and the insert/update
-- policies already exist in 20261028120000_schema_rls.sql.

-- ---------------------------------------------------------------------------
-- At most one open sleep per baby
-- ---------------------------------------------------------------------------

-- Fail with a clear message instead of a generic index build error.
do $$
begin
  if exists (
    select 1 from public.events
    where type = 'sleep' and ended_at is null
    group by baby_id having count(*) > 1
  ) then
    raise exception 'events has more than one open sleep for a baby; close the extras first';
  end if;
end;
$$;

-- Both parents tapping "start sleep" at once: the second insert gets 23505.
create unique index events_one_open_sleep_idx on public.events (baby_id)
  where type = 'sleep' and ended_at is null;

-- ---------------------------------------------------------------------------
-- Immutable event columns
-- ---------------------------------------------------------------------------

-- Members may only edit times and details. id, baby_id, type, created_by,
-- source and created_at are fixed at insert: no spoofing the author, no moving
-- an event to another baby, no turning a closed sleep into an open one.
-- The update policy's baby-in-my-family check stays as a second layer.
revoke update on public.events from authenticated;
grant update (started_at, ended_at, details) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Realtime checks the subscriber's select policy before sending INSERT/UPDATE.
-- Replica identity stays default, so DELETE payloads carry only the id.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'family_members'
  ) then
    alter publication supabase_realtime add table public.family_members;
  end if;
end;
$$;
