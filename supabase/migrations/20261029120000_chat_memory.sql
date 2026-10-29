-- Day 6b: buddy memory. Gated turns, full-text search and a per-thread summary.
-- Only the chat function (service role) inserts gated rows or writes thread_memory.

-- ---------------------------------------------------------------------------
-- Gated turns: a parent message whose turn escalated (health). Never used again
-- as history, summary input or search results.
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column gated boolean not null default false,
  add constraint chat_messages_gated_user check (not gated or role = 'user');

-- Backfill: user messages directly followed in their thread by an escalation.
update public.chat_messages m
set gated = true
from (
  select id, role,
         lead(escalation) over (partition by thread_id order by created_at, id) as next_escalation
  from public.chat_messages
) n
where m.id = n.id and n.role = 'user' and n.next_escalation is not null;

-- Clients still write plain user rows only, never gated ones, and never update.
drop policy chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and role = 'user'
    and escalation is null
    and proposal_summary is null
    and gated = false
    and exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id)
  );
revoke update on public.chat_messages from authenticated;

-- ---------------------------------------------------------------------------
-- Full-text search: 'simple' (no stemming) over unaccented text, so English and
-- Romanian behave alike and "febră" finds "febra".
-- ---------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- unaccent() is only STABLE (it reads a dictionary); with the dictionary named
-- explicitly the result is fixed, so this wrapper can back a generated column.
create function public.f_unaccent(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text);
$$;

alter table public.chat_messages
  add column search tsvector
  generated always as (to_tsvector('simple', public.f_unaccent(coalesce(content, '')))) stored;
create index chat_messages_search_idx on public.chat_messages using gin (search);

-- Search one thread. SECURITY INVOKER: the caller's RLS decides which threads and
-- messages exist, so another family's or the partner's private thread returns nothing.
create function public.search_thread_messages(p_thread_id uuid, p_query text, p_limit integer default 5)
returns table (role text, content text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.role, m.content, m.created_at
  from public.chat_messages m
  where m.thread_id = p_thread_id
    and not m.gated
    and m.escalation is null
    and m.content is not null
    and m.search @@ websearch_to_tsquery('simple', public.f_unaccent(left(coalesce(p_query, ''), 200)))
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke execute on function public.f_unaccent(text) from public, anon;
grant execute on function public.f_unaccent(text) to authenticated, service_role;
revoke execute on function public.search_thread_messages(uuid, text, integer) from public, anon;
grant execute on function public.search_thread_messages(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-thread summary of older, non-gated messages
-- ---------------------------------------------------------------------------

create table public.thread_memory (
  thread_id uuid primary key references public.chat_threads (id) on delete cascade,
  summary text not null check (char_length(summary) between 1 and 4000),
  -- created_at of the newest message folded into the summary.
  covered_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.thread_memory enable row level security;

-- Visible exactly when the thread is: the thread's own RLS applies in the subquery,
-- so a private thread's memory is its owner's only.
create policy thread_memory_select on public.thread_memory for select to authenticated
  using (exists (select 1 from public.chat_threads t where t.id = thread_memory.thread_id));
-- No insert, update or delete policy: only the chat function writes.
revoke insert, update, delete, truncate, references, trigger on public.thread_memory from authenticated;
revoke all on public.thread_memory from anon;
