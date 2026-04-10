create table if not exists public.user_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  created_at timestamptz not null default now(),
  constraint user_interests_subject_check check (subject in ('english', 'math', 'physics'))
);

create unique index if not exists user_interests_user_subject_unique
  on public.user_interests (user_id, subject);

create table if not exists public.user_interest_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  created_at timestamptz not null default now(),
  constraint user_interest_clicks_subject_check check (subject in ('english', 'math', 'physics'))
);

create index if not exists user_interest_clicks_subject_created_at_idx
  on public.user_interest_clicks (subject, created_at desc);

create index if not exists user_interest_clicks_user_created_at_idx
  on public.user_interest_clicks (user_id, created_at desc);
