alter table public.quiz_attempt_answers
  alter column score_awarded type numeric using score_awarded::numeric,
  alter column max_score type numeric using max_score::numeric;

alter table public.quiz_attempts
  alter column raw_score type numeric using raw_score::numeric,
  alter column total_score type numeric using total_score::numeric;
