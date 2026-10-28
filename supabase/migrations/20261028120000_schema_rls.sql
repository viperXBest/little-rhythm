-- Little Rhythm: core schema, RLS and helpers.
-- Every row hangs off a family; is_family_member() protects all of it.
-- Functions are SECURITY DEFINER with an empty search_path and fully qualified names.

-- ---------------------------------------------------------------------------
-- Privileges: deny by default, grant explicitly
-- ---------------------------------------------------------------------------

-- Future objects created by migrations (role postgres).
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- TRUNCATE bypasses RLS; REFERENCES and TRIGGER are never needed by clients.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'parent' check (role in ('parent')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  -- v1: one family per user.
  constraint family_members_user_id_key unique (user_id)
);

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  birth_date date not null check (birth_date <= current_date),
  created_at timestamptz not null default now()
);
create index babies_family_id_idx on public.babies (family_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  type text not null check (type in ('feed', 'sleep', 'diaper')),
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  source text not null default 'tap' check (source in ('tap', 'chat', 'voice')),
  created_at timestamptz not null default now()
);
create index events_baby_started_idx on public.events (baby_id, started_at desc);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invites_family_id_idx on public.invites (family_id);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  -- null = shared thread; set = private to that user.
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index chat_threads_family_id_idx on public.chat_threads (family_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now(),
  unique (family_id, user_id, day)
);

create table public.api_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  function text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, function, window_start)
);

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.events enable row level security;
alter table public.invites enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.checkins enable row level security;
alter table public.api_usage enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers used by policies
-- ---------------------------------------------------------------------------

create function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members
    where family_id = p_family_id and user_id = auth.uid()
  );
$$;

-- Separate helper: a checkins policy that queried checkins would recurse.
create function public.has_checked_in(p_family_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.checkins
    where family_id = p_family_id and day = p_day and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- profiles: yourself and your co-parent.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.family_members fm
      where fm.user_id = profiles.id and public.is_family_member(fm.family_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- families / family_members: read-only for members; writes go through
-- create_family() and the pair function.
create policy families_select on public.families for select to authenticated
  using (public.is_family_member(id));

create policy family_members_select on public.family_members for select to authenticated
  using (public.is_family_member(family_id));

-- babies: created by create_family(); members can read and rename.
create policy babies_select on public.babies for select to authenticated
  using (public.is_family_member(family_id));
create policy babies_update on public.babies for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- events: full CRUD for members of the baby's family.
create policy events_select on public.events for select to authenticated
  using (exists (
    select 1 from public.babies b
    where b.id = events.baby_id and public.is_family_member(b.family_id)
  ));
create policy events_insert on public.events for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.babies b
      where b.id = events.baby_id and public.is_family_member(b.family_id)
    )
  );
create policy events_update on public.events for update to authenticated
  using (exists (
    select 1 from public.babies b
    where b.id = events.baby_id and public.is_family_member(b.family_id)
  ))
  with check (exists (
    select 1 from public.babies b
    where b.id = events.baby_id and public.is_family_member(b.family_id)
  ));
create policy events_delete on public.events for delete to authenticated
  using (exists (
    select 1 from public.babies b
    where b.id = events.baby_id and public.is_family_member(b.family_id)
  ));

-- invites: members can see whether an invite is pending. Writes only via the
-- pair function (service role). code_hash is an HMAC with a server-side pepper.
create policy invites_select on public.invites for select to authenticated
  using (public.is_family_member(family_id));

-- chat_threads: shared threads for the family, private threads for the owner only.
create policy chat_threads_select on public.chat_threads for select to authenticated
  using (
    public.is_family_member(family_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );
create policy chat_threads_insert on public.chat_threads for insert to authenticated
  with check (
    public.is_family_member(family_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

-- chat_messages: visible when the thread is visible (thread RLS applies in the
-- subquery). Clients only write their own user messages; the chat function
-- writes assistant messages with the service role.
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (exists (
    select 1 from public.chat_threads t where t.id = chat_messages.thread_id
  ));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and role = 'user'
    and exists (select 1 from public.chat_threads t where t.id = chat_messages.thread_id)
  );

-- checkins: your own rows always; your partner's only once you answered the
-- same day. No update policy: answers lock once submitted.
create policy checkins_select on public.checkins for select to authenticated
  using (
    user_id = (select auth.uid())
    or (public.is_family_member(family_id) and public.has_checked_in(family_id, day))
  );
create policy checkins_insert on public.checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_family_member(family_id));

-- api_usage: read your own counters; writes via consume_rate_limit() only.
create policy api_usage_select on public.api_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Profile row on sign-up
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 50), ''),
      'Parent'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates the family, adds the caller as a parent, and creates the baby, atomically.
create function public.create_family(p_baby_name text, p_baby_birth_date date)
returns uuid
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
  if exists (select 1 from public.family_members where user_id = v_user) then
    raise exception 'already_in_family' using errcode = 'P0001';
  end if;
  if p_baby_birth_date is null
     or p_baby_birth_date > current_date
     or p_baby_birth_date < current_date - interval '3 years' then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;

  insert into public.families (created_by) values (v_user) returning id into v_family;
  insert into public.family_members (family_id, user_id) values (v_family, v_user);
  insert into public.babies (family_id, name, birth_date)
    values (v_family, btrim(p_baby_name), p_baby_birth_date);
  return v_family;
end;
$$;

-- Fixed-window counter. Returns true while the caller is within p_max.
create function public.consume_rate_limit(
  p_user_id uuid,
  p_function text,
  p_window_seconds integer,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.api_usage as u (user_id, function, window_start, count)
    values (p_user_id, p_function, v_window, 1)
  on conflict (user_id, function, window_start)
    do update set count = u.count + 1
  returning u.count into v_count;

  delete from public.api_usage
    where user_id = p_user_id and function = p_function
      and window_start < now() - interval '1 day';

  return v_count <= p_max;
end;
$$;

-- Stores a new invite for the caller's family, replacing any pending one.
create function public.create_invite(p_user_id uuid, p_code_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
  v_expires timestamptz := now() + interval '24 hours';
begin
  select family_id into v_family from public.family_members where user_id = p_user_id;
  if v_family is null then
    raise exception 'not_in_family' using errcode = 'P0001';
  end if;

  perform 1 from public.families where id = v_family for update;
  if (select count(*) from public.family_members where family_id = v_family) >= 2 then
    raise exception 'family_full' using errcode = 'P0001';
  end if;

  update public.invites set expires_at = now()
    where family_id = v_family and used_at is null and expires_at > now();

  insert into public.invites (family_id, code_hash, expires_at, created_by)
    values (v_family, p_code_hash, v_expires, p_user_id);
  return v_expires;
end;
$$;

-- Redeems an invite: single use, unexpired, max two parents per family.
-- Not found / used / expired share one error so the response is not an oracle.
create function public.redeem_invite(p_user_id uuid, p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
begin
  select * into v_invite from public.invites where code_hash = p_code_hash for update;
  if not found or v_invite.used_at is not null or v_invite.expires_at <= now() then
    raise exception 'invalid_or_expired_code' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.family_members where user_id = p_user_id) then
    raise exception 'already_in_family' using errcode = 'P0001';
  end if;

  perform 1 from public.families where id = v_invite.family_id for update;
  if (select count(*) from public.family_members where family_id = v_invite.family_id) >= 2 then
    raise exception 'family_full' using errcode = 'P0001';
  end if;

  update public.invites set used_at = now(), used_by = p_user_id where id = v_invite.id;
  insert into public.family_members (family_id, user_id) values (v_invite.family_id, p_user_id);
  return v_invite.family_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for existing objects
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_family_member(uuid) to authenticated, service_role;
grant execute on function public.has_checked_in(uuid, date) to authenticated, service_role;
grant execute on function public.create_family(text, date) to authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.create_invite(uuid, text) to service_role;
grant execute on function public.redeem_invite(uuid, text) to service_role;
