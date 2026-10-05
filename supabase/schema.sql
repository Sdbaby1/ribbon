-- Ribbon profiles for Arc mainnet.
-- Run this once in the Supabase SQL editor for a new project.
-- The API connects with the service-role key, which bypasses RLS.
-- Anonymous and authenticated keys have no policies, so they cannot read or write.

create table if not exists public.profiles (
  address text primary key,
  display_name text not null,
  updated_at timestamptz not null default now(),
  constraint profiles_address_fmt check (address ~ '^0x[0-9a-f]{40}$'),
  constraint profiles_name_len check (char_length(display_name) between 1 and 32)
);

alter table public.profiles enable row level security;

-- Intentionally no policies. Browser clients never hold the service-role key.
-- Ribbon's API verifies a wallet signature, then writes with the service role.
