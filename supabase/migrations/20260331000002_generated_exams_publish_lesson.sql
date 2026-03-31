alter table public.generated_exams
  add column if not exists published_lesson_id uuid references public.lessons(id) on delete set null;

alter table public.generated_exams
  add column if not exists published_at timestamp with time zone;

create index if not exists generated_exams_published_lesson_idx
on public.generated_exams (published_lesson_id);
