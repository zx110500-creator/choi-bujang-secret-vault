create table if not exists public.device_approvals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[0-9a-f]{32}$'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (owner_id, device_id)
);

alter table public.device_approvals enable row level security;
revoke all on table public.device_approvals from anon, authenticated;
grant all on table public.device_approvals to service_role;
