-- 003: "Question" as a type, and comments on items (Carlos's request, Oct 21, 2026).
--
-- Anyone who entered the team code can read and add comments. A comment
-- written with admin tools on is marked as from a board admin; the database
-- sets that mark, so nobody can fake it. People can delete their own
-- comments; admins can delete any. Comments can't be edited.
-- Admins can already change any item column (items_update_admin), which is
-- how the drawer changes an item's type.
-- Safe to run more than once.

-------------------------------------------------------------------------------
-- Types: Feedback, Bug, Process, Question
-------------------------------------------------------------------------------

alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check
  check (type in ('Feedback', 'Bug', 'Process', 'Question'));

-------------------------------------------------------------------------------
-- Comments
-------------------------------------------------------------------------------

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  author     text not null check (char_length(trim(author)) between 1 and 80),
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  by_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists comments_item_idx on public.comments (item_id, created_at);
alter table public.comments enable row level security;

-- People on the board can't choose who a comment is from, when, or whether it
-- counts as an admin's. Inserts from the SQL editor are left as written.
create or replace function public.on_comment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    new.by_admin   := public.is_admin();
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_insert_defaults on public.comments;
create trigger comments_insert_defaults
before insert on public.comments
for each row execute function public.on_comment_insert();

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments
  for select to authenticated using (public.is_allowed_user());

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated with check (public.is_allowed_user());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (public.is_admin() or (public.is_allowed_user() and created_by = auth.uid()));

-- No update policy: comments can't be edited.
revoke all on public.comments from anon, authenticated;
grant select, insert, delete on public.comments to authenticated;

-------------------------------------------------------------------------------
-- Live updates
-------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end;
$$;
