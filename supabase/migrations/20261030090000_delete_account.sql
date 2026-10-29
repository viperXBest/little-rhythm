-- Day 7: account deletion (F8). Assistant replies link to the turn they answer,
-- so a parent's shared-thread turns can be deleted whole, and one SQL function
-- removes everything a deleting parent owns. The delete-account function calls
-- it with the service role, then deletes the auth user.

-- ---------------------------------------------------------------------------
-- reply_to: the user message an assistant row answers
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column reply_to uuid references public.chat_messages (id) on delete cascade,
  add constraint chat_messages_reply_to_assistant check (reply_to is null or role = 'assistant');
create index chat_messages_reply_to_idx on public.chat_messages (reply_to);

-- Clients still write plain user rows only: no flags, no link.
drop policy chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and role = 'user'
    and escalation is null
    and proposal_summary is null
    and gated = false
    and reply_to is null
    and exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id)
  );

-- Backfill for rows written before reply_to existed. An assistant row is linked
-- only when the row right before it is a user message and that is the only user
-- message since the previous assistant row (or the thread start). Anything else
-- is ambiguous (two parents typing at once) and stays null for a human to review.
-- Returns the number of assistant rows left unlinked. Not callable by clients.
create function public.link_unlinked_replies()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unlinked integer;
begin
  with ordered as (
    select id, thread_id, role, reply_to,
           lag(id) over w as prev_id,
           lag(role) over w as prev_role,
           -- Assistant rows strictly before this one: a run of user messages and
           -- the assistant row that ends it share one value.
           count(*) filter (where role = 'assistant') over w
             - (case when role = 'assistant' then 1 else 0 end) as replies_before
    from public.chat_messages
    window w as (partition by thread_id order by created_at, id)
  ),
  runs as (
    select thread_id, replies_before, count(*) as user_count
    from ordered
    where role = 'user'
    group by thread_id, replies_before
  )
  update public.chat_messages m
  set reply_to = o.prev_id
  from ordered o
  join runs r on r.thread_id = o.thread_id and r.replies_before = o.replies_before
  where m.id = o.id
    and o.role = 'assistant'
    and o.reply_to is null
    and o.prev_role = 'user'
    and r.user_count = 1;

  select count(*) into v_unlinked
  from public.chat_messages
  where role = 'assistant' and reply_to is null;
  return v_unlinked;
end;
$$;
revoke execute on function public.link_unlinked_replies() from public, anon, authenticated, service_role;

do $$
declare
  v_unlinked integer := public.link_unlinked_replies();
begin
  raise notice 'reply_to backfill: % assistant rows left unlinked', v_unlinked;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_account_data: everything a deleting parent owns, in one transaction
-- ---------------------------------------------------------------------------

-- Last member of the family: the family and everything under it.
-- One parent of two: their private thread, their shared-thread turns (the
-- replies cascade through reply_to), the shared thread's summary (it re-folds
-- without them), their check-ins and pending invites, their membership; their
-- events stay with created_by = null. Both: their rate-limit rows and profile.
-- The caller deletes the auth user afterwards. Safe to run twice.
create function public.delete_account_data(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_others integer;
  v_path text := 'no_family';
begin
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;

  select family_id into v_family from public.family_members where user_id = p_user_id;
  if v_family is not null then
    -- Two parents deleting at once: the second waits here, then sees it is the last.
    perform 1 from public.families where id = v_family for update;
    select count(*) into v_others
    from public.family_members
    where family_id = v_family and user_id <> p_user_id;

    if v_others = 0 then
      delete from public.families where id = v_family;
      v_path := 'family_deleted';
    else
      delete from public.chat_threads where family_id = v_family and owner_id = p_user_id;
      delete from public.chat_messages
        where author_id = p_user_id
          and thread_id in (select id from public.chat_threads where family_id = v_family);
      delete from public.thread_memory
        where thread_id in (
          select id from public.chat_threads where family_id = v_family and owner_id is null
        );
      delete from public.checkins where user_id = p_user_id;
      delete from public.invites where created_by = p_user_id and used_at is null;
      update public.events set created_by = null
        where created_by = p_user_id
          and baby_id in (select id from public.babies where family_id = v_family);
      delete from public.family_members where family_id = v_family and user_id = p_user_id;
      v_path := 'member_removed';
    end if;
  end if;

  delete from public.api_usage where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
  return v_path;
end;
$$;

revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
