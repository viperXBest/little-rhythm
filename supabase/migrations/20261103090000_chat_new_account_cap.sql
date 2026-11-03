-- A smaller daily chat cap for brand-new accounts (v1.1.1, plan item 14).
--
-- Sign-up is open (judges make their own family), so throwaway accounts could each take a
-- full day's turns and drain the global spend breaker for everyone. An account whose
-- auth.users.created_at is less than p_new_account_seconds old gets at most
-- p_new_account_max turns that UTC day (counted in the same api_usage 'chat_day' row);
-- after that hour the normal per-user cap applies to the same count. The chat function
-- passes 10 turns and 3600 s (_shared/chat-limits.ts). A refusal returns the outcome
-- 'new_account', which the function answers with the same 429 rate_limited.
--
-- The demo accounts are not affected: the seed (scripts/seed-demo/seed.ts, upsertUser)
-- updates existing users and keeps their created_at; only the very first seed of a fresh
-- project creates them, and that hour is the only time the cap applies to them.
--
-- The 5-argument consume_chat_budget stays, as a wrapper without the new-account cap, so
-- the deployed chat v9 keeps working between this migration and the chat v10 deploy.
-- Drop it in a later migration once v10 is live.

create function public.consume_chat_budget(
  p_user_id uuid,
  p_user_max integer,
  p_family_max integer,
  p_global_max bigint,
  p_reserve bigint,
  p_new_account_max integer,
  p_new_account_seconds integer
)
returns table (outcome text, day_start timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
  v_family uuid;
  v_count bigint;
  v_created timestamptz;
  v_new boolean := false;
  v_user_max integer := p_user_max;
begin
  if p_reserve is null or p_reserve < 0 or p_global_max is null or p_reserve > p_global_max then
    raise exception 'invalid_reserve' using errcode = '22023';
  end if;
  if p_new_account_max is not null
     and (p_new_account_max < 0 or p_new_account_seconds is null or p_new_account_seconds <= 0) then
    raise exception 'invalid_new_account_cap' using errcode = '22023';
  end if;

  if p_new_account_max is not null then
    select u.created_at into v_created from auth.users u where u.id = p_user_id;
    -- An unknown creation time counts as new (fails closed).
    v_new := v_created is null or v_created > now() - make_interval(secs => p_new_account_seconds);
    if v_new and p_new_account_max < v_user_max then
      v_user_max := p_new_account_max;
    else
      v_new := false;
    end if;
  end if;

  if not public.consume_rate_limit(p_user_id, 'chat_day', 86400, v_user_max) then
    return query select (case when v_new then 'new_account' else 'user' end)::text, v_day;
    return;
  end if;

  select m.family_id into v_family from public.family_members m where m.user_id = p_user_id limit 1;
  if v_family is null then
    -- Unreachable from chat (the baby was resolved first); fail closed anyway.
    return query select 'family'::text, v_day;
    return;
  end if;

  insert into public.usage_counters as u (scope, family_id, function, window_start, count)
    values ('family', v_family, 'chat', v_day, 1)
  on conflict (scope, family_id, function, window_start)
    do update set count = u.count + 1
  returning u.count into v_count;
  if v_count > p_family_max then
    return query select 'family'::text, v_day;
    return;
  end if;

  -- Reserve only if the reservation fits: a refused turn adds nothing.
  v_count := null;
  insert into public.usage_counters as u (scope, family_id, function, window_start, count)
    values ('global', null, 'chat_spend', v_day, p_reserve)
  on conflict (scope, family_id, function, window_start)
    do update set count = u.count + excluded.count
    where u.count + excluded.count <= p_global_max
  returning u.count into v_count;
  if v_count is null then
    return query select 'global'::text, v_day;
    return;
  end if;

  delete from public.usage_counters c
    where c.window_start < now() - interval '2 days'
      and (c.scope = 'global' or c.family_id = v_family);

  return query select 'ok'::text, v_day;
end;
$$;

-- The v1.1.0 signature, now a wrapper with no new-account cap (for chat v9 only).
create or replace function public.consume_chat_budget(
  p_user_id uuid,
  p_user_max integer,
  p_family_max integer,
  p_global_max bigint,
  p_reserve bigint
)
returns table (outcome text, day_start timestamptz)
language sql
security definer
set search_path = ''
as $$
  select b.outcome, b.day_start
  from public.consume_chat_budget(p_user_id, p_user_max, p_family_max, p_global_max, p_reserve, null, null) b;
$$;

revoke execute on function public.consume_chat_budget(uuid, integer, integer, bigint, bigint, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_chat_budget(uuid, integer, integer, bigint, bigint, integer, integer)
  to service_role;
revoke execute on function public.consume_chat_budget(uuid, integer, integer, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.consume_chat_budget(uuid, integer, integer, bigint, bigint) to service_role;
