-- Growth measurements: partner CRUD, family isolation, immutable columns, the typo-guard bounds,
-- the date limits, the realtime publication, and both account-deletion paths.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid, p_name text) returns void
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_id::text || '@test.local', jsonb_build_object('display_name', p_name), now(), now());
$$;

create function tests.as_user(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create function tests.as_postgres() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Family A: A1 and A2, baby born 60 days ago. Family B: B1, baby born 30 days ago.
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'A1');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'A2');
select tests.create_user('bbbbbbbb-0000-0000-0000-000000000001', 'B1');

insert into public.families (id) values
  ('aaaaaaaa-f000-0000-0000-000000000000'),
  ('bbbbbbbb-f000-0000-0000-000000000000');
insert into public.family_members (family_id, user_id) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.babies (id, family_id, name, birth_date) values
  ('aaaaaaaa-b000-0000-0000-000000000000', 'aaaaaaaa-f000-0000-0000-000000000000', 'Baby A', current_date - 60),
  ('bbbbbbbb-b000-0000-0000-000000000000', 'bbbbbbbb-f000-0000-0000-000000000000', 'Baby B', current_date - 30);
-- A1's weight (4200 g) and B1's weight (3800 g).
insert into public.growth_measurements (id, baby_id, kind, value, measured_on, created_by) values
  ('aaaaaaaa-9000-0000-0000-000000000001', 'aaaaaaaa-b000-0000-0000-000000000000', 'weight', 4200,
   current_date - 20, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-9000-0000-0000-000000000001', 'bbbbbbbb-b000-0000-0000-000000000000', 'weight', 3800,
   current_date - 10, 'bbbbbbbb-0000-0000-0000-000000000001');

select plan(50);

-- ---- Privileges and realtime ---------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.growth_measurements', 'select')
  and not has_table_privilege('anon', 'public.growth_measurements', 'insert')
  and not has_table_privilege('anon', 'public.growth_measurements', 'update')
  and not has_table_privilege('anon', 'public.growth_measurements', 'delete'),
  'anon has no privileges on growth_measurements');
select ok(
  has_table_privilege('authenticated', 'public.growth_measurements', 'select')
  and has_table_privilege('authenticated', 'public.growth_measurements', 'delete')
  and not has_table_privilege('authenticated', 'public.growth_measurements', 'insert')
  and not has_table_privilege('authenticated', 'public.growth_measurements', 'update')
  and not has_table_privilege('authenticated', 'public.growth_measurements', 'truncate'),
  'authenticated can select and delete, and insert and update only by column');
select ok(
  has_column_privilege('authenticated', 'public.growth_measurements', 'baby_id', 'insert')
  and has_column_privilege('authenticated', 'public.growth_measurements', 'kind', 'insert')
  and has_column_privilege('authenticated', 'public.growth_measurements', 'value', 'insert')
  and has_column_privilege('authenticated', 'public.growth_measurements', 'measured_on', 'insert')
  and not has_column_privilege('authenticated', 'public.growth_measurements', 'created_by', 'insert')
  and not has_column_privilege('authenticated', 'public.growth_measurements', 'id', 'insert')
  and not has_column_privilege('authenticated', 'public.growth_measurements', 'created_at', 'insert'),
  'clients insert baby_id, kind, value and measured_on only');
select ok(
  has_column_privilege('authenticated', 'public.growth_measurements', 'value', 'update')
  and has_column_privilege('authenticated', 'public.growth_measurements', 'measured_on', 'update')
  and not has_column_privilege('authenticated', 'public.growth_measurements', 'baby_id', 'update')
  and not has_column_privilege('authenticated', 'public.growth_measurements', 'kind', 'update')
  and not has_column_privilege('authenticated', 'public.growth_measurements', 'created_by', 'update'),
  'clients update value and measured_on only');
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'growth_measurements'
  ),
  'growth_measurements is in the realtime publication');

-- ---- Partner A2: full CRUD on A1's measurements ---------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');

select is((select count(*)::int from public.growth_measurements), 1, 'A2 reads A1''s measurement (and only family A''s)');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 4300, current_date - 5)$$,
  'A2 inserts a weight');
select is(
  (select created_by from public.growth_measurements where kind = 'weight' and value = 4300),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'created_by defaults to the caller');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'length', 540, current_date - 5)$$,
  'A2 inserts a length');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'head', 370, current_date - 5)$$,
  'A2 inserts a head circumference');
select isnt_empty(
  $$update public.growth_measurements set value = 4250 where id = 'aaaaaaaa-9000-0000-0000-000000000001' returning id$$,
  'A2 corrects the value of A1''s measurement');
select isnt_empty(
  $$update public.growth_measurements set measured_on = current_date - 19
    where id = 'aaaaaaaa-9000-0000-0000-000000000001' returning id$$,
  'A2 corrects the date of A1''s measurement');
select isnt_empty(
  $$delete from public.growth_measurements where kind = 'weight' and value = 4300 returning id$$,
  'A2 deletes a measurement');

-- ---- Immutable columns -----------------------------------------------------------
select throws_ok(
  $$update public.growth_measurements set kind = 'length' where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'kind cannot be changed');
select throws_ok(
  $$update public.growth_measurements set baby_id = 'bbbbbbbb-b000-0000-0000-000000000000'
    where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'a measurement cannot be moved to another family''s baby');
select throws_ok(
  $$update public.growth_measurements set created_by = 'aaaaaaaa-0000-0000-0000-000000000002'
    where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'created_by cannot be rewritten');
select throws_ok(
  $$update public.growth_measurements set id = gen_random_uuid() where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'id cannot be changed');
select throws_ok(
  $$update public.growth_measurements set created_at = now() where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'created_at cannot be changed');

-- ---- Insert integrity ------------------------------------------------------------
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on, created_by) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 4300, current_date, 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'A2 cannot insert as A1 (created_by is not insertable)');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('bbbbbbbb-b000-0000-0000-000000000000', 'weight', 4300, current_date)$$,
  '42501', null, 'A2 cannot insert with another family''s baby_id');

-- ---- Typo-guard bounds (grams for weight, millimetres for length and head) ---------
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 299, current_date)$$,
  '23514', null, 'a weight below 300 g is rejected');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 30001, current_date)$$,
  '23514', null, 'a weight above 30000 g is rejected');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'length', 199, current_date)$$,
  '23514', null, 'a length below 200 mm is rejected');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'length', 1201, current_date)$$,
  '23514', null, 'a length above 1200 mm is rejected');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'head', 149, current_date)$$,
  '23514', null, 'a head circumference below 150 mm is rejected');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'head', 601, current_date)$$,
  '23514', null, 'a head circumference above 600 mm is rejected');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 250, current_date)$$,
  '23514', null, 'the bounds are per kind (250 fits a head, not a weight)');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'temperature', 370, current_date)$$,
  '23514', null, 'only weight, length and head are accepted');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 300, current_date),
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 30000, current_date),
    ('aaaaaaaa-b000-0000-0000-000000000000', 'length', 200, current_date),
    ('aaaaaaaa-b000-0000-0000-000000000000', 'length', 1200, current_date),
    ('aaaaaaaa-b000-0000-0000-000000000000', 'head', 150, current_date),
    ('aaaaaaaa-b000-0000-0000-000000000000', 'head', 600, current_date)$$,
  'the bounds themselves are accepted');
select throws_ok(
  $$update public.growth_measurements set value = 10 where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '23514', null, 'an update cannot take a value out of its bounds');

-- ---- Dates: from the birth date to tomorrow ----------------------------------------
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 4400, (now() at time zone 'utc')::date + 2)$$,
  '42501', null, 'a date two days ahead is rejected');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 4400, (now() at time zone 'utc')::date + 1)$$,
  'tomorrow is accepted (time-zone slack)');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 3300, current_date - 61)$$,
  '42501', null, 'a date before the birth date is rejected');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 3300, current_date - 60)$$,
  'the birth date itself is accepted');
select throws_ok(
  $$update public.growth_measurements set measured_on = (now() at time zone 'utc')::date + 2
    where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'an update cannot move the date into the future');
select throws_ok(
  $$update public.growth_measurements set measured_on = current_date - 61
    where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  '42501', null, 'an update cannot move the date before the birth date');

-- ---- Other family: nothing ---------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is_empty(
  $$select 1 from public.growth_measurements where baby_id = 'aaaaaaaa-b000-0000-0000-000000000000'$$,
  'B1 sees no family A measurements');
select throws_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'weight', 4000, current_date)$$,
  '42501', null, 'B1 cannot insert for baby A');
select is_empty(
  $$update public.growth_measurements set value = 1000 where id = 'aaaaaaaa-9000-0000-0000-000000000001' returning id$$,
  'B1 cannot update a family A measurement');
select is_empty(
  $$delete from public.growth_measurements where id = 'aaaaaaaa-9000-0000-0000-000000000001' returning id$$,
  'B1 cannot delete a family A measurement');
select lives_ok(
  $$insert into public.growth_measurements (baby_id, kind, value, measured_on) values
    ('bbbbbbbb-b000-0000-0000-000000000000', 'length', 520, current_date - 3)$$,
  'B1 can log for their own baby');

-- ---- Anon ----------------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$select 1 from public.growth_measurements$$,
  '42501', null, 'anon cannot read measurements');

-- ---- Family A untouched by B1 ---------------------------------------------------------
select tests.as_postgres();
select results_eq(
  $$select value, measured_on from public.growth_measurements where id = 'aaaaaaaa-9000-0000-0000-000000000001'$$,
  $$values (4250, current_date - 19)$$,
  'the family A measurement holds only the partner''s correction');

-- ---- One parent of two leaves: the rows stay, without their author ----------------------
set local role service_role;
select is(public.delete_account_data('aaaaaaaa-0000-0000-0000-000000000001'), 'member_removed',
  'A1 is removed from a two-parent family');
reset role;
-- The delete-account function removes the auth user right after delete_account_data.
select lives_ok(
  $$delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'the auth user is deleted afterwards');
select is(
  (select created_by from public.growth_measurements where id = 'aaaaaaaa-9000-0000-0000-000000000001'),
  null,
  'A1''s measurement stays, without its author');
select ok(
  (select count(*) from public.growth_measurements
   where baby_id = 'aaaaaaaa-b000-0000-0000-000000000000'
     and created_by = 'aaaaaaaa-0000-0000-0000-000000000002') > 0,
  'A2''s measurements keep their author');

-- ---- Last member leaves: the measurements go with the family ------------------------------
set local role service_role;
select is(public.delete_account_data('aaaaaaaa-0000-0000-0000-000000000002'), 'family_deleted',
  'the last member takes the family with them');
reset role;
select is(
  (select count(*)::int from public.growth_measurements where baby_id = 'aaaaaaaa-b000-0000-0000-000000000000'),
  0,
  'no measurement of family A remains');
select is(
  (select count(*)::int from public.growth_measurements where baby_id = 'bbbbbbbb-b000-0000-0000-000000000000'),
  2,
  'family B''s measurements are untouched');

select * from finish();
rollback;
