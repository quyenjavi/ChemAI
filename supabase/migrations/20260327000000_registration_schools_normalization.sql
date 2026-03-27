-- Ensure schools table supports nationwide onboarding with normalization + review workflow

create or replace function public.normalize_school_name(input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    translate(
      lower(coalesce(input, '')),
      'áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ',
      'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyy'
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;

alter table public.schools
  add column if not exists normalized_name text;

update public.schools
set normalized_name = public.normalize_school_name(name)
where normalized_name is null or normalized_name = '';

alter table public.schools
  alter column normalized_name set default '',
  alter column normalized_name set not null;

alter table public.schools
  add column if not exists status text default 'pending_review',
  add column if not exists merged_into_school_id uuid references public.schools(id),
  add column if not exists created_at timestamp default now();

create index if not exists schools_city_normalized_name_idx
on public.schools (city_id, normalized_name);
