-- Day 6: chat threads and messages for the buddy, check-in rules, and realtime
-- for both. The base policies are in 20261028120000_schema_rls.sql.

-- ---------------------------------------------------------------------------
-- One shared thread per family, one private thread per parent
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.chat_threads where owner_id is null
    group by family_id having count(*) > 1
  ) or exists (
    select 1 from public.chat_threads where owner_id is not null
    group by family_id, owner_id having count(*) > 1
  ) then
    raise exception 'chat_threads has duplicate threads; merge them first';
  end if;
end;
$$;

create unique index chat_threads_one_shared_idx on public.chat_threads (family_id)
  where owner_id is null;
create unique index chat_threads_one_private_idx on public.chat_threads (family_id, owner_id)
  where owner_id is not null;

-- The caller's shared and private thread ids, created on first use. Safe when
-- both phones call it at once: the unique indexes decide, then both read back.
create function public.ensure_chat_threads()
returns table (shared_id uuid, private_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_family uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select fm.family_id into v_family from public.family_members fm where fm.user_id = v_user;
  if v_family is null then
    raise exception 'not_in_family' using errcode = 'P0001';
  end if;

  insert into public.chat_threads (family_id, owner_id) values (v_family, null)
    on conflict (family_id) where owner_id is null do nothing;
  insert into public.chat_threads (family_id, owner_id) values (v_family, v_user)
    on conflict (family_id, owner_id) where owner_id is not null do nothing;

  return query select
    (select t.id from public.chat_threads t where t.family_id = v_family and t.owner_id is null),
    (select t.id from public.chat_threads t where t.family_id = v_family and t.owner_id = v_user);
end;
$$;

revoke execute on function public.ensure_chat_threads() from public, anon;
grant execute on function public.ensure_chat_threads() to authenticated;

-- ---------------------------------------------------------------------------
-- Assistant messages: escalation flag and a server-built proposal summary
-- ---------------------------------------------------------------------------

-- An escalation row carries no model text: the app shows a static card.
alter table public.chat_messages alter column content drop not null;
alter table public.chat_messages
  add column escalation text check (escalation in ('health', 'urgent')),
  add column proposal_summary text check (char_length(proposal_summary) between 1 and 500),
  add constraint chat_messages_content_or_escalation check (content is not null or escalation is not null),
  add constraint chat_messages_escalation_assistant check (escalation is null or role = 'assistant');

-- Clients write plain user messages only. Assistant rows (and their flags)
-- come from the chat function after it has checked the thread.
drop policy chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and role = 'user'
    and escalation is null
    and proposal_summary is null
    and exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id)
  );

-- ---------------------------------------------------------------------------
-- Check-ins: two fixed questions, today's local date only
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.checkins
    where not (
      answers - 'mood' - 'help' = '{}'::jsonb
      and jsonb_typeof(answers -> 'mood') = 'number'
      and (answers ->> 'mood') in ('1', '2', '3', '4', '5')
      and jsonb_typeof(answers -> 'help') = 'string'
      and char_length(answers ->> 'help') <= 280
    )
  ) then
    raise exception 'checkins has rows in an old answers shape; remove them first';
  end if;
end;
$$;

-- { "mood": 1..5, "help": "one thing that would help me today" (0..280 chars) }
alter table public.checkins add constraint checkins_answers_shape check (
  answers - 'mood' - 'help' = '{}'::jsonb
  and jsonb_typeof(answers -> 'mood') = 'number'
  and (answers ->> 'mood') in ('1', '2', '3', '4', '5')
  and jsonb_typeof(answers -> 'help') = 'string'
  and char_length(answers ->> 'help') <= 280
);

-- The day is the phone's local date, which is within a day of the server's
-- UTC date for every zone (UTC-12 to UTC+14). No answering days ahead.
drop policy checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_family_member(family_id)
    and day between current_date - 1 and current_date + 1
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Realtime runs the subscriber's select policy on each change: the partner gets
-- shared-thread messages only, and a check-in only once they answered that day.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkins'
  ) then
    alter publication supabase_realtime add table public.checkins;
  end if;
end;
$$;
