create table if not exists public.results (
  id            text primary key check (char_length(id) between 1 and 40),
  name          text not null check (char_length(name) between 1 and 20),
  score         integer not null check (score between 0 and 10000000),
  level_reached integer not null check (level_reached between 1 and 500),
  correct_words integer not null check (correct_words between 0 and 100000),
  accuracy      numeric not null check (accuracy between 0 and 100),
  max_combo     integer not null check (max_combo between 0 and 100000),
  wpm           numeric not null check (wpm between 0 and 300),
  language      text not null check (language in ('en', 'vi')),
  created_at    bigint not null
);

create index if not exists results_created_at_idx on public.results (created_at desc);

revoke all on public.results from anon, authenticated;
grant select, insert on public.results to anon;

alter table public.results enable row level security;

drop policy if exists "public read" on public.results;
create policy "public read" on public.results for select to anon using (true);

drop policy if exists "public insert" on public.results;
create policy "public insert" on public.results for insert to anon with check (true);
