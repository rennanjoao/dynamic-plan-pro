-- Migration: shopping_sessions
-- Registra cada sessão de lista de compras gerada pelo aluno.
-- Usado para: streak de semanas, visibilidade do coach, análise de adesão.

create table if not exists public.shopping_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  protocol_id   uuid references public.protocols(id) on delete set null,
  period_days   integer not null default 7,
  items_total   integer not null default 0,
  items_completed integer not null default 0,
  completed     boolean not null default false,
  streak        integer not null default 1,
  created_at    timestamptz not null default now()
);

create index if not exists shopping_sessions_user_id_idx
  on public.shopping_sessions (user_id, created_at desc);

create index if not exists shopping_sessions_protocol_id_idx
  on public.shopping_sessions (protocol_id, created_at desc);

alter table public.shopping_sessions enable row level security;

create policy "Aluno lê próprias sessões"
  on public.shopping_sessions
  for select
  using (auth.uid() = user_id);

create policy "Aluno insere próprias sessões"
  on public.shopping_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "Coach lê sessões dos alunos"
  on public.shopping_sessions
  for select
  using (
    exists (
      select 1 from public.coach_students cs
      where cs.coach_id = auth.uid()
        and cs.student_id = shopping_sessions.user_id
    )
  );
