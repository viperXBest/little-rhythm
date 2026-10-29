-- Every table has RLS and policies; anon gets nothing; dangerous grants are gone.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every public table has RLS enabled'
);

select is(
  (select count(*)::int from pg_tables t
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename
     )),
  0,
  'every public table has at least one policy'
);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  11,
  'the schema has the eleven spec tables'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and has_table_privilege('anon', c.oid, 'select,insert,update,delete')),
  0,
  'anon has no table privileges in public'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon cannot execute any function in public'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and has_table_privilege('authenticated', c.oid, 'truncate')),
  0,
  'authenticated cannot TRUNCATE (it would bypass RLS)'
);

select ok(
  not has_function_privilege('authenticated', 'public.create_invite(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.redeem_invite(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.consume_rate_limit(uuid, text, integer, integer)', 'execute'),
  'pairing and rate-limit functions are service-role only'
);

select ok(
  has_function_privilege('authenticated', 'public.create_family(text, date)', 'execute'),
  'authenticated can call create_family'
);

-- Default privileges cover objects created by future migrations.
create table public.future_table (id int);
create function public.future_fn() returns int language sql as $$ select 1 $$;

select ok(
  not has_table_privilege('anon', 'public.future_table', 'select'),
  'future tables are not granted to anon'
);
select ok(
  not has_function_privilege('anon', 'public.future_fn()', 'execute'),
  'future functions are not executable by anon'
);
select ok(
  not has_function_privilege('authenticated', 'public.future_fn()', 'execute'),
  'future functions need an explicit grant for authenticated'
);

select * from finish();
rollback;
