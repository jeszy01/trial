create table if not exists app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table app_data enable row level security;
create policy "open" on app_data for all using (true) with check (true);
