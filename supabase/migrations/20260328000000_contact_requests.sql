create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text,
  email text,
  phone text,
  request_type text not null, -- bug_report | feedback | login_issue | general_contact
  subject text,
  message text,
  status text not null default 'pending',
  created_at timestamp with time zone default now()
);

create index if not exists contact_requests_user_idx on public.contact_requests (user_id, created_at desc);

