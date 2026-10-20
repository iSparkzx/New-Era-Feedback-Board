-- 002: Team code and admin code instead of email sign-in.
--
-- Visitors get a Supabase anonymous session (no email). Entering the team
-- code adds that session to `members`, which lets it read and submit.
-- Entering the admin code also marks it as an admin (move and delete).
-- Codes are stored only as bcrypt hashes and are not case-sensitive.
-- Safe to run more than once.
--
-- Set or change the codes (this also signs everyone out of the board):
--   select public.set_board_codes('<team code>', '<admin code>');

create extension if not exists pgcrypto with schema extensions;

-------------------------------------------------------------------------------
-- Tables (no client access: RLS on, no policies)
-------------------------------------------------------------------------------

create table if not exists public.board_codes (
  id              int primary key default 1 check (id = 1),
  team_code_hash  text not null,
  admin_code_hash text not null,
  updated_at      timestamptz not null default now()
);
alter table public.board_codes enable row level security;

create table if not exists public.members (
  uid       uuid primary key references auth.users(id) on delete cascade,
  is_admin  boolean not null default false,
  joined_at timestamptz not null default now()
);
alter table public.members enable row level security;

-- Recent code attempts, used to slow down guessing.
create table if not exists public.code_attempts (
  id   bigint generated always as identity primary key,
  uid  uuid,
  kind text not null check (kind in ('team', 'admin')),
  ok   boolean not null,
  at   timestamptz not null default now()
);
create index if not exists code_attempts_at_idx on public.code_attempts (at desc);
alter table public.code_attempts enable row level security;

-------------------------------------------------------------------------------
-- Who is allowed (replaces the email-only versions from schema.sql)
-------------------------------------------------------------------------------

-- A member (entered the team code), or a signed-in email on an allowed domain.
create or replace function public.is_allowed_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.uid = auth.uid())
      or exists (
        select 1 from public.allowed_domains d
        where d.domain = split_part(public.current_email(), '@', 2)
      );
$$;

-- A member who entered the admin code, or an allowed email listed in admins.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.uid = auth.uid() and m.is_admin)
      or (public.is_allowed_user()
          and exists (select 1 from public.admins a where a.email = public.current_email()));
$$;

-------------------------------------------------------------------------------
-- Code functions
-------------------------------------------------------------------------------

-- Too many wrong tries: 10 per session, or 200 overall, in 10 minutes.
create or replace function public.code_throttled()
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from public.code_attempts
          where uid = auth.uid() and not ok and at > now() - interval '10 minutes') >= 10
      or (select count(*) from public.code_attempts
          where not ok and at > now() - interval '10 minutes') >= 200;
$$;

-- Returns 'ok', 'wrong', 'too_many', 'not_set', or 'no_session'.
create or replace function public.join_board(code text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  h  text;
  ok boolean;
begin
  if auth.uid() is null then return 'no_session'; end if;
  delete from public.code_attempts where at < now() - interval '1 day';
  if public.code_throttled() then return 'too_many'; end if;
  select team_code_hash into h from public.board_codes where id = 1;
  if h is null then return 'not_set'; end if;
  ok := crypt(lower(btrim(coalesce(code, ''))), h) = h;
  insert into public.code_attempts (uid, kind, ok) values (auth.uid(), 'team', ok);
  if not ok then return 'wrong'; end if;
  insert into public.members (uid) values (auth.uid()) on conflict (uid) do nothing;
  return 'ok';
end;
$$;

-- Returns 'ok', 'wrong', 'too_many', 'not_set', or 'no_session'.
-- The admin code also counts as the team code.
create or replace function public.unlock_admin(code text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  h  text;
  ok boolean;
begin
  if auth.uid() is null then return 'no_session'; end if;
  if public.code_throttled() then return 'too_many'; end if;
  select admin_code_hash into h from public.board_codes where id = 1;
  if h is null then return 'not_set'; end if;
  ok := crypt(lower(btrim(coalesce(code, ''))), h) = h;
  insert into public.code_attempts (uid, kind, ok) values (auth.uid(), 'admin', ok);
  if not ok then return 'wrong'; end if;
  insert into public.members (uid, is_admin) values (auth.uid(), true)
  on conflict (uid) do update set is_admin = true;
  return 'ok';
end;
$$;

-- Turns admin tools off for this session (stays a member).
create or replace function public.lock_admin()
returns void language sql volatile security definer set search_path = public as $$
  update public.members set is_admin = false where uid = auth.uid();
$$;

-- Sets both codes and removes every member, so everyone enters the new code.
create or replace function public.set_board_codes(team_code text, admin_code text)
returns void language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if char_length(btrim(coalesce(team_code, ''))) < 8 or char_length(btrim(coalesce(admin_code, ''))) < 12 then
    raise exception 'The team code needs at least 8 characters and the admin code at least 12';
  end if;
  if lower(btrim(team_code)) = lower(btrim(admin_code)) then
    raise exception 'The team code and admin code must be different';
  end if;
  insert into public.board_codes (id, team_code_hash, admin_code_hash, updated_at)
  values (1, crypt(lower(btrim(team_code)), gen_salt('bf', 10)), crypt(lower(btrim(admin_code)), gen_salt('bf', 10)), now())
  on conflict (id) do update
    set team_code_hash = excluded.team_code_hash,
        admin_code_hash = excluded.admin_code_hash,
        updated_at = now();
  delete from public.members where true;
end;
$$;

-------------------------------------------------------------------------------
-- Who may call what
-------------------------------------------------------------------------------

revoke all on function public.code_throttled()               from public, anon, authenticated;
revoke all on function public.set_board_codes(text, text)    from public, anon, authenticated;
revoke all on function public.join_board(text)               from public, anon;
revoke all on function public.unlock_admin(text)             from public, anon;
revoke all on function public.lock_admin()                   from public, anon;
grant execute on function public.join_board(text)   to authenticated;
grant execute on function public.unlock_admin(text) to authenticated;
grant execute on function public.lock_admin()       to authenticated;
