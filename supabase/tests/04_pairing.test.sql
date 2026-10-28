-- Pairing invites: 24 h, single use, max two parents; rate limiting.
-- create_invite / redeem_invite / consume_rate_limit run as the service role
-- (here: postgres) from the pair Edge Function.
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

grant execute on all functions in schema tests to anon, authenticated;

select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'A1');
select tests.create_user('bbbbbbbb-0000-0000-0000-000000000001', 'B1');
select tests.create_user('cccccccc-0000-0000-0000-000000000001', 'C1');
select tests.create_user('dddddddd-0000-0000-0000-000000000001', 'D1');
select tests.create_user('eeeeeeee-0000-0000-0000-000000000001', 'E1');
select tests.create_user('ffffffff-0000-0000-0000-000000000001', 'F1');

insert into public.families (id) values
  ('aaaaaaaa-f000-0000-0000-000000000000'),
  ('bbbbbbbb-f000-0000-0000-000000000000'),
  ('eeeeeeee-f000-0000-0000-000000000000');
insert into public.family_members (family_id, user_id) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('eeeeeeee-f000-0000-0000-000000000000', 'eeeeeeee-0000-0000-0000-000000000001');

select plan(17);

-- ---- create_invite ----------------------------------------------------------
-- Evaluate once: BETWEEN would expand the volatile call twice.
select ok(
  expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute',
  'an invite expires in 24 hours')
from (select public.create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'hash-1') as expires_at) s;
select throws_ok(
  $$select public.create_invite('cccccccc-0000-0000-0000-000000000001', 'hash-x')$$,
  'P0001', 'not_in_family', 'a user without a family cannot create an invite');
select lives_ok(
  $$select public.create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'hash-2')$$,
  'creating a new invite works');
select throws_ok(
  $$select public.redeem_invite('cccccccc-0000-0000-0000-000000000001', 'hash-1')$$,
  'P0001', 'invalid_or_expired_code', 'a new invite invalidates the previous one');

-- ---- redeem_invite ----------------------------------------------------------
select is(
  public.redeem_invite('cccccccc-0000-0000-0000-000000000001', 'hash-2'),
  'aaaaaaaa-f000-0000-0000-000000000000'::uuid,
  'redeeming returns the family');
select ok(
  exists (select 1 from public.family_members
          where family_id = 'aaaaaaaa-f000-0000-0000-000000000000'
            and user_id = 'cccccccc-0000-0000-0000-000000000001'),
  'the redeemer is now a member');
select throws_ok(
  $$select public.redeem_invite('dddddddd-0000-0000-0000-000000000001', 'hash-2')$$,
  'P0001', 'invalid_or_expired_code', 'a code is single use');
select throws_ok(
  $$select public.create_invite('aaaaaaaa-0000-0000-0000-000000000001', 'hash-3')$$,
  'P0001', 'family_full', 'a full family cannot create invites');

insert into public.invites (family_id, code_hash, expires_at) values
  ('bbbbbbbb-f000-0000-0000-000000000000', 'hash-expired', now() - interval '1 second'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'hash-full', now() + interval '1 hour');
select throws_ok(
  $$select public.redeem_invite('dddddddd-0000-0000-0000-000000000001', 'hash-expired')$$,
  'P0001', 'invalid_or_expired_code', 'an expired code is rejected');
select throws_ok(
  $$select public.redeem_invite('dddddddd-0000-0000-0000-000000000001', 'no-such-hash')$$,
  'P0001', 'invalid_or_expired_code', 'an unknown code gets the same error');
select throws_ok(
  $$select public.redeem_invite('ffffffff-0000-0000-0000-000000000001', 'hash-full')$$,
  'P0001', 'family_full', 'a third parent cannot join');

select lives_ok(
  $$select public.create_invite('eeeeeeee-0000-0000-0000-000000000001', 'hash-e')$$,
  'family E creates an invite');
select throws_ok(
  $$select public.redeem_invite('bbbbbbbb-0000-0000-0000-000000000001', 'hash-e')$$,
  'P0001', 'already_in_family', 'a user already in a family cannot join another');

-- ---- consume_rate_limit -----------------------------------------------------
select ok(
  public.consume_rate_limit('dddddddd-0000-0000-0000-000000000001', 'pair_redeem', 900, 2)
  and public.consume_rate_limit('dddddddd-0000-0000-0000-000000000001', 'pair_redeem', 900, 2),
  'calls within the limit are allowed');
select ok(
  not public.consume_rate_limit('dddddddd-0000-0000-0000-000000000001', 'pair_redeem', 900, 2),
  'the call over the limit is refused');
select ok(
  public.consume_rate_limit('dddddddd-0000-0000-0000-000000000001', 'pair_create', 900, 2),
  'limits are counted per function');

-- ---- Clients cannot call the service-role functions -------------------------
select tests.as_user('dddddddd-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.redeem_invite('dddddddd-0000-0000-0000-000000000001', 'hash-e')$$,
  '42501', null, 'authenticated users cannot bypass the pair function');

select * from finish();
rollback;
