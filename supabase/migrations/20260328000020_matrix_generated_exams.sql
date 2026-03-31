create table if not exists public.generated_exams (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  grade_id uuid references public.grades(id) on delete set null,
  title text not null,
  matrix_config jsonb not null,
  is_published boolean not null default false,
  created_at timestamp with time zone default now()
);

create index if not exists generated_exams_lesson_idx on public.generated_exams (lesson_id, created_at desc);

create table if not exists public.generated_exam_questions (
  exam_id uuid not null references public.generated_exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  order_index int not null,
  primary key (exam_id, question_id)
);

create unique index if not exists generated_exam_questions_order_uq
on public.generated_exam_questions (exam_id, order_index);

