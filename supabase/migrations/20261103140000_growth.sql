-- v1.2.0: growth records (weight, length, head circumference).
--
-- A plain log for the parents: no norms, percentiles or reference ranges live here or anywhere
-- else, and no Edge Function reads this table (growth data never goes to the AI).
-- value is an integer in grams (weight) or millimetres (length, head). The CHECK bounds
-- are typo guards (a misplaced decimal point), not statements about what is normal.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.growth_measurements (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  kind text not null check (kind in ('weight', 'length', 'head')),
  -- grams for weight, millimetres for length and head
  value integer not null,
  measured_on date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint growth_measurements_value_range check (
    (kind = 'weight' and value between 300 and 30000)
    or (kind = 'length' and value between 200 and 1200)
    or (kind = 'head' and value between 150 and 600)
  )
);
create index growth_measurements_baby_measured_idx
  on public.growth_measurements (baby_id, measured_on);

alter table public.growth_measurements enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges: deny by default, grant column by column
-- ---------------------------------------------------------------------------

-- Members may add a measurement (baby_id, kind, value, measured_on) and fix a typo
-- (value, measured_on). id and created_at come from the defaults and created_by from
-- auth.uid(): no spoofing the author, no moving a row to another baby or changing its
-- kind. The policies' baby-in-my-family checks stay as a second layer.
revoke all on public.growth_measurements from anon, authenticated;
grant select, delete on public.growth_measurements to authenticated;
grant insert (baby_id, kind, value, measured_on) on public.growth_measurements to authenticated;
grant update (value, measured_on) on public.growth_measurements to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: full CRUD for members of the baby's family
-- ---------------------------------------------------------------------------

-- A date is accepted from the baby's birth date up to tomorrow in UTC (the day is pinned to UTC, not
-- to the session's time zone): the extra day absorbs the difference between the phone's calendar day
-- and the UTC day, which is at most one day in either direction.
create policy growth_select on public.growth_measurements for select to authenticated
  using (exists (
    select 1 from public.babies b
    where b.id = growth_measurements.baby_id and public.is_family_member(b.family_id)
  ));
create policy growth_insert on public.growth_measurements for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and measured_on <= (now() at time zone 'utc')::date + 1
    and exists (
      select 1 from public.babies b
      where b.id = growth_measurements.baby_id
        and public.is_family_member(b.family_id)
        and b.birth_date <= growth_measurements.measured_on
    )
  );
create policy growth_update on public.growth_measurements for update to authenticated
  using (exists (
    select 1 from public.babies b
    where b.id = growth_measurements.baby_id and public.is_family_member(b.family_id)
  ))
  with check (
    measured_on <= (now() at time zone 'utc')::date + 1
    and exists (
      select 1 from public.babies b
      where b.id = growth_measurements.baby_id
        and public.is_family_member(b.family_id)
        and b.birth_date <= growth_measurements.measured_on
    )
  );
create policy growth_delete on public.growth_measurements for delete to authenticated
  using (exists (
    select 1 from public.babies b
    where b.id = growth_measurements.baby_id and public.is_family_member(b.family_id)
  ));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Same as events: Realtime checks the subscriber's select policy before sending
-- INSERT/UPDATE; replica identity stays default, so DELETE payloads carry only the id.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'growth_measurements'
  ) then
    alter publication supabase_realtime add table public.growth_measurements;
  end if;
end;
$$;

-- Account deletion needs no change: delete_account_data removes the family of its last member,
-- and the babies and their measurements cascade. When one parent of two leaves, the rows stay
-- with the family and created_by becomes null with the auth user (on delete set null).
