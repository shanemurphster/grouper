-- Profiles table and RLS policies
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  school text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

-- policy: users can select/insert/update their own profile
create policy "profiles_own" on profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Note: create a Supabase Storage bucket named 'avatars' via the dashboard.
-- For secure access, configure bucket policies so users can only read/write their own folder.

