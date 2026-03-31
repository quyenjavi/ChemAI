create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  grade_id uuid references public.grades(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  source_type text not null default 'standard',
  parent_exam_id uuid references public.exams(id) on delete set null,
  status text not null default 'draft',
  total_questions int not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists exams_created_by_idx on public.exams (created_by, created_at desc);

create table if not exists public.exam_blueprint_items (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_type text not null,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  difficulty text,
  quantity int not null,
  points_per_question numeric not null,
  sort_order int not null default 0,
  created_at timestamp with time zone default now()
);

create index if not exists exam_blueprint_items_exam_idx on public.exam_blueprint_items (exam_id, sort_order);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  blueprint_item_id uuid references public.exam_blueprint_items(id) on delete set null,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_order int not null,
  points numeric not null,
  source_type text not null default 'bank',
  source_question_id uuid,
  created_at timestamp with time zone default now()
);

create unique index if not exists exam_questions_exam_order_uq on public.exam_questions (exam_id, question_order);
create index if not exists exam_questions_exam_idx on public.exam_questions (exam_id);

alter table public.teacher_profiles
  add column if not exists can_create_exam boolean not null default false;

