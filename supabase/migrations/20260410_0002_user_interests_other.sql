alter table public.user_interests
add column if not exists subject_other text;

alter table public.user_interest_clicks
add column if not exists subject_other text;

alter table public.user_interests
drop constraint if exists user_interests_subject_check;

alter table public.user_interests
add constraint user_interests_subject_check
check (subject in ('english', 'math', 'physics', 'other'));

alter table public.user_interest_clicks
drop constraint if exists user_interest_clicks_subject_check;

alter table public.user_interest_clicks
add constraint user_interest_clicks_subject_check
check (subject in ('english', 'math', 'physics', 'other'));
