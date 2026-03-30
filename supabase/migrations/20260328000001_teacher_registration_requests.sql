create table if not exists public.teacher_registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text,
  email text,
  phone text not null,
  school_name text,
  subject_name text,
  message text,
  status text not null default 'pending',
  created_at timestamp with time zone default now()
);

create index if not exists teacher_reg_requests_user_idx on public.teacher_registration_requests (user_id, created_at desc);

