-- Bolso — schema do banco (Supabase / Postgres).
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute UMA vez.
-- É seguro rodar de novo: tudo usa "if not exists" / "create or replace".

-- ============================================================
-- Controle de acesso: só e-mails da tabela allowed_emails criam conta
-- ============================================================
create table if not exists public.allowed_emails (
  email text primary key
);
alter table public.allowed_emails enable row level security;
-- sem policies: ninguém acessa pela API; edite pelo Table Editor do painel.

create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where lower(email) = lower(new.email)
  ) then
    raise exception 'Cadastro não permitido para este e-mail';
  end if;
  return new;
end;
$$;

drop trigger if exists bolso_allowed_email on auth.users;
create trigger bolso_allowed_email
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();

-- ============================================================
-- Tabelas
-- ============================================================
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('checking', 'credit', 'investment')),
  initial_balance numeric(14,2) not null default 0,
  closing_day     int check (closing_day between 1 and 31),
  due_day         int check (due_day between 1 and 31),
  credit_limit    numeric(14,2),
  color           text not null default '#111111',
  is_default      boolean not null default false,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('expense', 'income')),
  icon         text not null default 'tag',
  color        text not null default '#6b7280',
  keywords     text[] not null default '{}',
  budget_limit numeric(14,2) check (budget_limit is null or budget_limit >= 0),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.recurrences (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description          text not null,
  amount               numeric(14,2) not null check (amount > 0),
  kind                 text not null check (kind in ('expense', 'income')),
  account_id           uuid not null references public.accounts(id) on delete cascade,
  category_id          uuid references public.categories(id) on delete set null,
  tags                 text[] not null default '{}',
  day_of_month         int not null check (day_of_month between 1 and 31),
  start_month          text not null check (start_month ~ '^\d{4}-\d{2}$'),
  end_month            text check (end_month is null or end_month ~ '^\d{4}-\d{2}$'),
  last_generated_month text check (last_generated_month is null or last_generated_month ~ '^\d{4}-\d{2}$'),
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

create table if not exists public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind               text not null check (kind in ('expense', 'income', 'transfer')),
  amount             numeric(14,2) not null check (amount > 0),
  date               date not null,
  description        text not null default '',
  notes              text not null default '',
  tags               text[] not null default '{}',
  status             text not null default 'paid' check (status in ('paid', 'pending')),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  to_account_id      uuid references public.accounts(id) on delete cascade,
  category_id        uuid references public.categories(id) on delete set null,
  installment_group  uuid,
  installment_number int,
  installment_total  int,
  recurrence_id      uuid references public.recurrences(id) on delete set null,
  ref_month          text,
  invoice_ref        text,
  created_at         timestamptz not null default now(),
  constraint transfer_needs_destination check (
    (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (kind <> 'transfer' and to_account_id is null)
  )
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_account_idx on public.transactions (account_id);
-- impede gerar duas vezes a mesma recorrência no mesmo mês (nulls não conflitam)
create unique index if not exists transactions_recurrence_month_uniq
  on public.transactions (recurrence_id, ref_month);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text,
  dedupe_key text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.investment_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  date       date not null,
  balance    numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists snapshots_account_date_idx on public.investment_snapshots (account_id, date);

-- ============================================================
-- Row Level Security: cada pessoa só enxerga e altera o que é dela
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurrences','transactions','notifications','investment_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- Reforço: nada pode apontar para contas ou categorias de OUTRA pessoa (defesa em profundidade:
-- os identificadores são aleatórios, mas o banco não deve depender disso).
drop policy if exists "own rows" on public.transactions;
create policy "own rows" on public.transactions for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and account_id in (select id from public.accounts where user_id = auth.uid())
    and (to_account_id is null or to_account_id in (select id from public.accounts where user_id = auth.uid()))
    and (category_id is null or category_id in (select id from public.categories where user_id = auth.uid()))
  );

drop policy if exists "own rows" on public.recurrences;
create policy "own rows" on public.recurrences for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and account_id in (select id from public.accounts where user_id = auth.uid())
    and (category_id is null or category_id in (select id from public.categories where user_id = auth.uid()))
  );

drop policy if exists "own rows" on public.investment_snapshots;
create policy "own rows" on public.investment_snapshots for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and account_id in (select id from public.accounts where user_id = auth.uid())
  );

-- ============================================================
-- Sincronização incremental: o app guarda uma cópia local e, ao abrir, baixa só o que mudou.
--  · updated_at em toda linha (atualizado por gatilho, o app não consegue falsificar)
--  · deleted_rows: registro das exclusões, para o app remover da cópia local
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurrences','transactions','notifications','investment_snapshots']
  loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default clock_timestamp()', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);
  end loop;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create table if not exists public.deleted_rows (
  tbl        text not null,
  id         uuid not null,
  user_id    uuid not null,
  deleted_at timestamptz not null default clock_timestamp(),
  primary key (tbl, id)
);
create index if not exists deleted_rows_user_idx on public.deleted_rows (user_id, deleted_at);
alter table public.deleted_rows enable row level security;
drop policy if exists "own rows read" on public.deleted_rows;
create policy "own rows read" on public.deleted_rows for select to authenticated using (user_id = auth.uid());
-- sem policy de escrita: só o gatilho (security definer) grava aqui

create or replace function public.record_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.deleted_rows (tbl, id, user_id) values (tg_table_name, old.id, old.user_id)
  on conflict (tbl, id) do update set deleted_at = clock_timestamp();
  -- o app confere tudo de novo a cada 7 dias; registros mais velhos que 30 dias não servem mais
  delete from public.deleted_rows where user_id = old.user_id and deleted_at < now() - interval '30 days';
  return old;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurrences','transactions','notifications','investment_snapshots']
  loop
    execute format('drop trigger if exists bolso_touch on public.%I', t);
    execute format('create trigger bolso_touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists bolso_record_delete on public.%I', t);
    execute format('create trigger bolso_record_delete after delete on public.%I for each row execute function public.record_delete()', t);
  end loop;
end $$;

-- ============================================================
-- ping(): usado pela rotina diária que evita a pausa do projeto gratuito
-- ============================================================
create or replace function public.ping()
returns timestamptz
language sql
security definer
set search_path = public
as $$ select now(); $$;
grant execute on function public.ping() to anon, authenticated;
