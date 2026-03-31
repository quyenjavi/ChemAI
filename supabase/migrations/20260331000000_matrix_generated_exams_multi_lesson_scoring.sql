alter table public.generated_exams
  add column if not exists lesson_ids uuid[] not null default '{}'::uuid[];

alter table public.generated_exams
  add column if not exists scoring_config jsonb not null default '{}'::jsonb;

alter table public.generated_exams
  add column if not exists total_questions int not null default 0;

alter table public.generated_exams
  add column if not exists total_score numeric not null default 0;

update public.generated_exams
set lesson_ids = array[lesson_id]
where coalesce(array_length(lesson_ids, 1), 0) = 0;

update public.generated_exams ge
set total_questions = coalesce(sub.cnt, 0)
from (
  select exam_id, count(*)::int as cnt
  from public.generated_exam_questions
  group by exam_id
) sub
where sub.exam_id = ge.id;

create index if not exists generated_exams_lesson_ids_gin_idx
on public.generated_exams
using gin (lesson_ids);
