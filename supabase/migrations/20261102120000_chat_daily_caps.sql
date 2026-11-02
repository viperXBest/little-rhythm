-- Daily chat caps and a global spend breaker (v1.1.0, security review 2 Nov, item 4).
--
-- The chat function calls consume_chat_budget() after the thread check and before
-- any model call (voice turns too). It checks, in order:
--   1. the caller's daily turns: api_usage through consume_rate_limit ('chat_day',
--      one UTC day), the same counter the hourly limit uses;
--   2. the family's daily turns: usage_counters, scope 'family';
--   3. the global daily spend: usage_counters, scope 'global', in micro-USD at the
--      assumed prices in _shared/chat-limits.ts. Each turn reserves its worst case
--      before the model is called and settles to its metered cost afterwards
--      (settle_chat_spend), so the day's spend can't pass the budget even with many
--      turns in flight.
-- A level is only counted once the level before it passed, so a capped user can't
-- drain the family's or everyone's budget with refused calls.
-- The caps themselves live in _shared/chat-limits.ts and are passed in.
--
-- usage_counters is not readable or writable by anon. Family members can read their
-- family's turn count; nobody but the service role can read the global row, and only
-- these two service-role functions write.

create table public.usage_counters (
  scope text not null check (scope in ('family', 'global')),
  family_id uuid references public.families (id) on delete cascade,
  function text not null check (char_length(function) <= 40),
  window_start timestamptz not null,
  count bigint not null default 0 check (count >= 0),
  constraint usage_counters_scope_family check ((scope = 'family') = (family_id is not null)),
  constraint usage_counters_key unique nulls not distinct (scope, family_id, function, window_start)
);

alter table public.usage_counters enable row level security;

create policy usage_counters_select on public.usage_counters for select to authenticated
  using (scope = 'family' and public.is_family_member(family_id));

revoke all on public.usage_counters from anon, authenticated;
grant select on public.usage_counters to authenticated;

-- outcome: 'ok', or the first cap that refused: 'user', 'family' or 'global'.
-- day_start: the UTC day the reservation was made in, for settle_chat_spend.
create function public.consume_chat_budget(
  p_user_id uuid,
  p_user_max integer,
  p_family_max integer,
  p_global_max bigint,
  p_reserve bigint
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
begin
  if p_reserve is null or p_reserve < 0 or p_global_max is null or p_reserve > p_global_max then
    raise exception 'invalid_reserve' using errcode = '22023';
  end if;

  if not public.consume_rate_limit(p_user_id, 'chat_day', 86400, p_user_max) then
    return query select 'user'::text, v_day;
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

-- Replaces a turn's reservation with its metered cost (micro-USD), in the day it
-- was reserved. A turn that never settles keeps its full reservation (fails safe).
create function public.settle_chat_spend(
  p_window_start timestamptz,
  p_reserved bigint,
  p_actual bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reserved is null or p_actual is null or p_reserved < 0 or p_actual < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  update public.usage_counters c
    set count = greatest(0, c.count - p_reserved + p_actual)
    where c.scope = 'global' and c.family_id is null and c.function = 'chat_spend'
      and c.window_start = p_window_start;
end;
$$;

revoke execute on function public.consume_chat_budget(uuid, integer, integer, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.consume_chat_budget(uuid, integer, integer, bigint, bigint) to service_role;
revoke execute on function public.settle_chat_spend(timestamptz, bigint, bigint) from public, anon, authenticated;
grant execute on function public.settle_chat_spend(timestamptz, bigint, bigint) to service_role;
