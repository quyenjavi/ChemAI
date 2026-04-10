alter table public.quiz_attempts
  add column if not exists source_type text,
  add column if not exists official_exam_id uuid,
  add column if not exists official_exam_attempt_id uuid,
  add column if not exists paper_id uuid,
  add column if not exists detected_paper_code text,
  add column if not exists claimed_at timestamptz,
  add column if not exists summary_json jsonb;

alter table public.quiz_attempt_answers
  add column if not exists paper_question_no integer,
  add column if not exists official_exam_attempt_answer_id uuid;

alter table public.official_exam_attempts
  add column if not exists claimed_quiz_attempt_id uuid,
  add column if not exists claimed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create unique index if not exists uq_quiz_attempts_official_exam_attempt_id
  on public.quiz_attempts(official_exam_attempt_id)
  where official_exam_attempt_id is not null;

create or replace function public.claim_official_exam_attempt(p_user_id uuid, p_official_exam_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att record;
  v_exam record;
  v_lesson_id uuid;
  v_new_attempt_id uuid;
  v_total_questions integer;
  v_score_percent numeric;
begin
  if p_user_id is null then
    raise exception 'missing_user';
  end if;

  select *
  into v_att
  from public.official_exam_attempts
  where id = p_official_exam_attempt_id
  for update;

  if not found then
    raise exception 'attempt_not_found';
  end if;

  if v_att.claimed_quiz_attempt_id is not null then
    raise exception 'already_claimed';
  end if;

  select *
  into v_exam
  from public.official_exams
  where id = v_att.official_exam_id;

  if not found then
    raise exception 'exam_not_found';
  end if;

  v_lesson_id := null;
  if v_exam.metadata ? 'lesson_id' then
    v_lesson_id := nullif(v_exam.metadata->>'lesson_id','')::uuid;
  end if;

  if v_lesson_id is null then
    select nullif(metadata->>'lesson_id','')::uuid
    into v_lesson_id
    from public.official_exam_papers
    where id = v_att.paper_id;
  end if;

  if v_lesson_id is null then
    raise exception 'missing_lesson_id';
  end if;

  select count(*)
  into v_total_questions
  from public.official_exam_attempt_answers
  where attempt_id = p_official_exam_attempt_id
    and question_id is not null;

  if v_total_questions is null or v_total_questions = 0 then
    raise exception 'missing_answers';
  end if;

  if v_att.max_score > 0 then
    v_score_percent := round((v_att.total_score / v_att.max_score) * 10000) / 100;
  else
    v_score_percent := 0;
  end if;

  v_new_attempt_id := gen_random_uuid();

  insert into public.quiz_attempts(
    id,
    user_id,
    lesson_id,
    total_questions,
    correct_answers,
    raw_score,
    total_score,
    score_percent,
    mode,
    status,
    source_type,
    official_exam_id,
    official_exam_attempt_id,
    paper_id,
    detected_paper_code,
    claimed_at,
    summary_json
  ) values (
    v_new_attempt_id,
    p_user_id,
    v_lesson_id,
    v_total_questions,
    v_att.correct_count,
    v_att.total_score,
    v_att.max_score,
    v_score_percent,
    'official_exam',
    'submitted',
    'official_exam',
    v_att.official_exam_id,
    p_official_exam_attempt_id,
    v_att.paper_id,
    v_att.detected_paper_code,
    now(),
    v_att.summary_json
  );

  insert into public.quiz_attempt_answers(
    attempt_id,
    question_id,
    selected_answer,
    is_correct,
    paper_question_no,
    official_exam_attempt_answer_id,
    score_awarded,
    max_score,
    statement_id,
    grading_method,
    created_at
  )
  select
    v_new_attempt_id,
    a.question_id,
    a.selected_answer,
    a.is_correct,
    a.paper_question_no,
    a.id,
    a.score_awarded,
    a.max_score,
    qs.id,
    'official_exam',
    now()
  from public.official_exam_attempt_answers a
  left join public.question_statements qs
    on qs.question_id = a.question_id
    and lower(qs.statement_key) = lower(coalesce(a.metadata->>'statement_key',''))
  where a.attempt_id = p_official_exam_attempt_id
    and a.question_id is not null;

  update public.official_exam_attempts
  set claimed_quiz_attempt_id = v_new_attempt_id,
      claimed_by_user_id = p_user_id,
      claimed_at = now(),
      updated_at = now()
  where id = p_official_exam_attempt_id;

  return v_new_attempt_id;
end;
$$;

