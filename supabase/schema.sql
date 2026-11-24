-- GradePilot schema: run this in Supabase Dashboard > SQL Editor.
-- Supabase Auth manages passwords. Never create a password column.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null,
  name text not null,
  internal_marks numeric(5,2) not null check (internal_marks >= 0 and internal_marks <= 60),
  target_grade text not null check (target_grade in ('O','A+','A','B+','B','C')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_semester_owner_fk
    foreign key (semester_id, user_id)
    references public.semesters(id, user_id)
    on delete cascade
);

create index if not exists semesters_user_idx on public.semesters(user_id);
create index if not exists subjects_user_semester_idx on public.subjects(user_id, semester_id);

alter table public.profiles enable row level security;
alter table public.semesters enable row level security;
alter table public.subjects enable row level security;

create policy "Users can read own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Users can create own profile"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

create policy "Users can update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Users manage own semesters"
on public.semesters for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users manage own subjects"
on public.subjects for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Optional updated_at trigger.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subjects_updated_at on public.subjects;
create trigger subjects_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();