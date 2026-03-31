alter table public.exams
  add column if not exists published_at timestamp with time zone;

