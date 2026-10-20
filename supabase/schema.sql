-- New Era Feedback Board: Supabase schema
-- Run in the Supabase SQL editor (or as a migration) on an empty project.
-- Order: schema.sql, then seed.sql.

-------------------------------------------------------------------------------
-- 1. Lookup and config tables
-------------------------------------------------------------------------------

-- The 10 board sections, in display order. Edit labels here, not in code.
create table public.statuses (
  key         text primary key,
  label       text not null,
  sort_order  int  not null unique,
  color       text not null  -- color token name used by the front end
);

insert into public.statuses (key, label, sort_order, color) values
  ('new',             'New',                       1,  'new'),
  ('review',          'In Review',                 2,  'rev'),
  ('assigned_carlos', 'Assigned: Carlos Mitchell', 3,  'asg'),
  ('assigned_corey',  'Assigned: Corey Frons',     4,  'asg'),
  ('assigned_pierre', 'Assigned: Pierre Colorado', 5,  'asg'),
  ('sent_it',         'Sent to IT',                6,  'it'),
  ('sent_hanson',     'Sent to Hanson',            7,  'han'),
  ('disqualified',    'Disqualified',              8,  'dq'),
  ('post_launch',     'Post Launch Enhancement',   9,  'post'),
  ('done',            'Done',                      10, 'done');

-- Email domains allowed to see and submit. Anyone else can sign in but sees nothing.
create table public.allowed_domains (
  domain text primary key check (domain = lower(domain))
);
insert into public.allowed_domains (domain) values ('worldemblem.com');

-- Board admins: can move items between sections and delete items.
-- Add people here by email (lowercase). Seeded with the board owner only.
create table public.admins (
  email text primary key check (email = lower(email))
);
insert into public.admins (email) values ('carlos.mitchell@worldemblem.com');

-------------------------------------------------------------------------------
-- 2. Helper functions used by access rules
-------------------------------------------------------------------------------

create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_allowed_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_domains d
    where d.domain = split_part(public.current_email(), '@', 2)
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_allowed_user()
     and exists (select 1 from public.admins a where a.email = public.current_email());
$$;

-------------------------------------------------------------------------------
-- 3. Items (one row per submission)
-------------------------------------------------------------------------------

create table public.items (
  id                uuid primary key default gen_random_uuid(),
  ref_num           int  generated always as identity unique,  -- shown as NE-01, NE-17, ... (imports use "overriding system value")
  first_name        text not null check (char_length(trim(first_name)) between 1 and 60),
  last_name         text not null check (char_length(trim(last_name))  between 1 and 60),
  department        text not null check (department in ('Marketing', 'Sales', 'Customer Service')),
  type              text not null check (type in ('Feedback', 'Bug', 'Process')),
  link              text check (link is null or link ~* '^https?://'),
  description       text not null check (char_length(trim(description)) between 5 and 4000),
  screenshots       text[] not null default '{}' check (cardinality(screenshots) <= 4),  -- storage object paths
  status            text not null default 'new' references public.statuses(key),
  source            text not null default 'Board' check (source in ('Board', 'Teams chat')),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null default auth.uid(),
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users(id) on delete set null
);

create index items_status_idx on public.items (status);
create index items_created_at_idx on public.items (created_at desc);

-- Status history: one row every time an item moves sections.
create table public.status_events (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.items(id) on delete cascade,
  from_status text references public.statuses(key),
  to_status   text not null references public.statuses(key),
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index status_events_item_idx on public.status_events (item_id, changed_at desc);

-- Record who moved an item and when, and log the move.
create or replace function public.on_item_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    insert into public.status_events (item_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger items_status_change
before update of status on public.items
for each row execute function public.on_item_status_change();

-- Signed-in non-admins can only create plain rows; force safe values on insert.
-- Inserts from the SQL editor (no signed-in user, e.g. seed.sql) are left as written.
create or replace function public.on_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and not public.is_admin() then
    new.status            := 'new';
    new.source            := 'Board';
    new.created_by        := auth.uid();
    new.created_at        := now();
    new.status_changed_at := null;
    new.status_changed_by := null;
    -- Screenshots must be files this user uploaded (their own storage folder).
    if exists (select 1 from unnest(new.screenshots) as p(path)
               where p.path not like auth.uid()::text || '/%') then
      raise exception 'Screenshots must be uploaded by the person submitting'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger items_insert_defaults
before insert on public.items
for each row execute function public.on_item_insert();

-------------------------------------------------------------------------------
-- 4. Row level security
-------------------------------------------------------------------------------

alter table public.statuses        enable row level security;
alter table public.allowed_domains enable row level security;
alter table public.admins          enable row level security;
alter table public.items           enable row level security;
alter table public.status_events   enable row level security;

-- Statuses: readable by allowed users. Changed only from the Supabase dashboard.
create policy statuses_read on public.statuses
  for select to authenticated using (public.is_allowed_user());

-- Admins list: readable by allowed users (so the page knows who can edit).
create policy admins_read on public.admins
  for select to authenticated using (public.is_allowed_user());

-- allowed_domains: no policies, so no client access. Managed in the dashboard.

-- Items
create policy items_read on public.items
  for select to authenticated using (public.is_allowed_user());

create policy items_insert on public.items
  for insert to authenticated with check (public.is_allowed_user());

create policy items_update_admin on public.items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy items_delete_admin on public.items
  for delete to authenticated using (public.is_admin());

-- Status history: read only for allowed users. Rows are written by the trigger.
create policy status_events_read on public.status_events
  for select to authenticated using (public.is_allowed_user());

-------------------------------------------------------------------------------
-- 5. Screenshot storage (private bucket)
-------------------------------------------------------------------------------
-- Object paths: <auth user id>/<random id>.<ext>
-- The front end shows images through signed URLs, never public URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 20971520,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy screenshots_read on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and public.is_allowed_user());

create policy screenshots_upload_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'screenshots'
    and public.is_allowed_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy screenshots_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots' and public.is_admin());

-------------------------------------------------------------------------------
-- 6. Live updates
-------------------------------------------------------------------------------
alter publication supabase_realtime add table public.items;
