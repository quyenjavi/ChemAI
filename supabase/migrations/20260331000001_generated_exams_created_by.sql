alter table public.generated_exams
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists generated_exams_created_by_idx
on public.generated_exams (created_by, created_at desc);
