create table if not exists public.pending_school_matches (
  id uuid primary key default gen_random_uuid(),

  raw_input_name text not null,
  normalized_input_name text not null,

  city_id uuid not null references public.cities(id) on delete cascade,

  temporary_school_id uuid references public.schools(id) on delete set null,
  suggested_school_id uuid references public.schools(id) on delete set null,
  resolved_school_id uuid references public.schools(id) on delete set null,

  status text not null default 'pending',
  confidence_score float,
  review_note text,

  created_by_user_id uuid references auth.users(id) on delete set null,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists pending_school_matches_city_status_idx
on public.pending_school_matches (city_id, status);

create index if not exists pending_school_matches_normalized_idx
on public.pending_school_matches (city_id, normalized_input_name);

