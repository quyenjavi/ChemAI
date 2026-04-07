-- 1) Normalize statement_key to lowercase for consistent matching
update question_statements
set statement_key = lower(statement_key)
where statement_key is not null and statement_key <> lower(statement_key);

-- 2) Deduplicate (question_id, statement_key) while preserving attempt history
with dups as (
  select
    question_id,
    statement_key,
    min(id) as keep_id,
    array_agg(id) as ids
  from question_statements
  group by question_id, statement_key
  having count(*) > 1
),
map as (
  select question_id, statement_key, keep_id, unnest(ids) as dup_id
  from dups
)
update quiz_attempt_answers qa
set statement_id = map.keep_id
from map
where qa.statement_id = map.dup_id
  and map.dup_id <> map.keep_id;

delete from question_statements qs
using map
where qs.id = map.dup_id
  and map.dup_id <> map.keep_id;

-- 3) Add uniqueness constraint to prevent future duplicates
alter table question_statements
add constraint question_statements_question_id_statement_key_key unique (question_id, statement_key);

