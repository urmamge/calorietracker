-- Saved custom foods ("My foods") for the website, shared across all your devices.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.custom_foods (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  brand text not null default '',
  calories real not null default 0,
  protein real not null default 0,
  carbs real not null default 0,
  fat real not null default 0,
  created_at timestamptz not null default now()
);

-- One saved copy per name + brand (case-insensitive), like the desktop app.
create unique index if not exists custom_foods_user_name_brand on public.custom_foods (user_id, lower(name), lower(brand));

alter table public.custom_foods enable row level security;

drop policy if exists "Users manage their own custom foods" on public.custom_foods;
create policy "Users manage their own custom foods" on public.custom_foods
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.custom_foods to authenticated;
