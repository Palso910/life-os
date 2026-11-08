create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferences jsonb not null default '{}'::jsonb,
  dashboard_layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  emoji text not null default '✨',
  difficulty text not null default 'normale'
    check (difficulty in ('facile', 'normale', 'difficile')),
  target integer not null default 7 check (target between 1 and 7),
  schedule jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
  reminder_time time,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (user_id, id)
);

create table if not exists public.habit_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null,
  day date not null,
  completed boolean not null,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  time_known boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id, day),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  done boolean not null default false,
  due_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  due_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription jsonb not null,
  timezone text not null default 'UTC',
  last_sent_key text,
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index if not exists habits_user_updated_idx on public.habits (user_id, updated_at desc);
create index if not exists logs_user_day_idx on public.habit_logs (user_id, day desc);
create index if not exists tasks_user_updated_idx on public.tasks (user_id, updated_at desc);
create index if not exists deadlines_user_due_idx on public.deadlines (user_id, due_at);
create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists focus_user_start_idx on public.focus_sessions (user_id, started_at desc);

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.tasks enable row level security;
alter table public.deadlines enable row level security;
alter table public.notes enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.achievements enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "profile owner only" on public.profiles;
create policy "profile owner only" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "habits owner only" on public.habits;
create policy "habits owner only" on public.habits
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "habit logs owner only" on public.habit_logs;
create policy "habit logs owner only" on public.habit_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tasks owner only" on public.tasks;
create policy "tasks owner only" on public.tasks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "deadlines owner only" on public.deadlines;
create policy "deadlines owner only" on public.deadlines
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notes owner only" on public.notes;
create policy "notes owner only" on public.notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "focus sessions owner only" on public.focus_sessions;
create policy "focus sessions owner only" on public.focus_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "achievements owner only" on public.achievements;
create policy "achievements owner only" on public.achievements
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push subscriptions owner only" on public.push_subscriptions;
create policy "push subscriptions owner only" on public.push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, update, delete on public.habit_logs to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.deadlines to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.focus_sessions to authenticated;
grant select, insert, update, delete on public.achievements to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();
