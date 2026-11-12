-- ============================================================================
--  SPEED CHESS — Supabase schema
--  Run this once in the Supabase dashboard:  SQL Editor -> New query -> paste -> Run
--  It is idempotent: re-running is safe.
-- ============================================================================
--
--  What this file owns:
--    * public.profiles       one row per auth user, created by a trigger
--    * Row Level Security    players read public fields, update only their own row
--    * private table         PII that must never be readable by other players
--
--  What this file does NOT own:
--    Ratings, games, puzzles, clubs and tournaments stay in the SPEED CHESS
--    API database (see docs/SCHEMA.md). Supabase is the identity provider and
--    profile store, not a replacement for the chess engine's data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null,
  avatar_url    text,
  country       text,
  chess_rating  integer not null default 1200 check (chess_rating between 100 and 3500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);

-- Usernames are compared case-insensitively, like the rest of the platform.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

comment on table public.profiles is
  'Public chess profile for a Supabase auth user. Created automatically by handle_new_user().';
comment on column public.profiles.chess_rating is
  'Headline rating shown next to a player. Per-time-control Glicko ratings live in the SPEED CHESS API.';

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Create a profile automatically after sign-up (secure trigger)
-- ---------------------------------------------------------------------------
--  SECURITY DEFINER is required: the trigger runs as the owner so it can write to
--  public.profiles even though `authenticated` has no INSERT policy at all.
--  `set search_path = ''` pins resolution so a malicious schema cannot shadow
--  the objects this function touches.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  final_username text;
  suffix integer := 0;
begin
  -- Prefer the username the player typed at sign-up; fall back to the email local-part.
  base_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if base_username is null then
    base_username := split_part(coalesce(new.email, 'player'), '@', 1);
  end if;

  -- Keep only characters the profiles check constraint allows.
  base_username := regexp_replace(base_username, '[^A-Za-z0-9_]', '_', 'g');
  base_username := left(base_username, 20);

  -- Pad short names so they satisfy the 3-character minimum.
  if length(base_username) < 3 then
    base_username := base_username || substr(replace(new.id::text, '-', ''), 1, 3);
  end if;

  -- Resolve collisions deterministically.
  final_username := base_username;
  while exists (select 1 from public.profiles p where lower(p.username) = lower(final_username)) loop
    suffix := suffix + 1;
    final_username := left(base_username, 18) || suffix::text;
  end loop;

  insert into public.profiles (id, username, country)
  values (
    new.id,
    final_username,
    -- Only store a clean two-letter country code; anything else becomes NULL.
    case
      when upper(trim(coalesce(new.raw_user_meta_data ->> 'country', ''))) ~ '^[A-Z]{2}$'
        then upper(trim(new.raw_user_meta_data ->> 'country'))
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Private account data
-- ---------------------------------------------------------------------------
--  Email and other personal data must never be exposed through a public
--  profile read. Keeping it in its own table means `select * from profiles`
--  (even by a careless client) cannot leak an address.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_private (
  id          uuid primary key references auth.users(id) on delete cascade,
  contact_email text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profile_private_touch on public.profile_private;
create trigger profile_private_touch
  before update on public.profile_private
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_private (id, contact_email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_private on auth.users;
create trigger on_auth_user_created_private
  after insert on auth.users
  for each row execute function public.handle_new_user_private();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;

-- Server-side/keyless access is always RLS-bound; the service role bypasses RLS by design and
-- must never be shipped to a browser.

-- ---- profiles -----------------------------------------------------------
-- Anyone (including anonymous visitors) may read the *public* columns of a profile.
-- Usernames, avatars, countries and ratings are public by design: they appear on
-- leaderboards and player pages. No email or other PII is stored in this table.
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- A player may update their own row, but *only* the display columns. Grants are
-- column-scoped so `chess_rating`, `id` and `created_at` cannot be rewritten by the
-- account owner; ratings are awarded by the server from real game results.
revoke all on public.profiles from anon, authenticated;
grant select (id, username, avatar_url, country, chess_rating, created_at, updated_at)
  on public.profiles to anon, authenticated;
grant update (username, avatar_url, country)
  on public.profiles to authenticated;

drop policy if exists "players can update their own profile" on public.profiles;
create policy "players can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No INSERT policy: rows are created by the trigger only.
drop policy if exists "players can delete their own profile" on public.profiles;
drop policy if exists "profile inserts are server-only" on public.profiles;

-- ---- profile_private ----------------------------------------------------
revoke all on public.profile_private from anon, authenticated;
grant select (id, contact_email, created_at, updated_at) on public.profile_private to authenticated;
grant update (contact_email) on public.profile_private to authenticated;

drop policy if exists "players can read their own private data" on public.profile_private;
create policy "players can read their own private data"
  on public.profile_private for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "players can update their own private data" on public.profile_private;
create policy "players can update their own private data"
  on public.profile_private for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 6. Backfill (safe to run more than once)
-- ---------------------------------------------------------------------------
--  Creates profiles for accounts that existed before this script was applied.
insert into public.profiles (id, username)
select u.id,
       left(regexp_replace(
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'username'), ''),
                  split_part(coalesce(u.email, 'player'), '@', 1)),
         '[^A-Za-z0-9_]', '_', 'g'), 20)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

insert into public.profile_private (id, contact_email)
select u.id, u.email
from auth.users u
where not exists (select 1 from public.profile_private p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Sanity check (visible in the SQL editor result pane)
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.profiles)        as profiles,
  (select count(*) from auth.users)             as auth_users,
  (select count(*) from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles', 'profile_private')) as policies;
