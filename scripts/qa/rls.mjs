// Testa as regras de acesso (RLS) com DOIS usuários e o papel "anon", como o Supabase faz.
// Papéis sem privilégio de superusuário: as regras valem de verdade (diferente de rodar como admin).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
// o Supabase concede acesso às tabelas do schema public a anon/authenticated por padrão; as regras (RLS) é que restringem
await db.exec(`grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`);
await db.exec(`insert into public.allowed_emails values ('a@x.com'), ('b@x.com'); insert into auth.users (email) values ('a@x.com'), ('b@x.com');`);
const [A, B] = (await db.query('select id from auth.users order by email')).rows.map((r) => r.id);

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FALHA', name, ok ? '' : extra); if (!ok) failed++; };
const as = async (role, uid, fn) => {
  await db.exec(`set role ${role}; set app.uid = '${uid ?? ''}'`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const rows = (sql) => db.query(sql).then((r) => r.rows).catch((e) => ({ error: e.message }));
const denied = async (sql) => { try { const r = await db.query(sql); return r.affectedRows === 0 || r.rows.length === 0 ? 'vazio' : false; } catch (e) { return 'erro'; } };

// dados de A
const accA = await as('authenticated', A, async () => (await db.query(`insert into accounts (name, kind) values ('Conta A', 'checking') returning id`)).rows[0].id);
const catA = await as('authenticated', A, async () => (await db.query(`insert into categories (name, kind) values ('Cat A', 'expense') returning id`)).rows[0].id);
await as('authenticated', A, () => db.exec(`insert into transactions (kind, amount, date, account_id, description) values ('expense', 10, '2026-10-01', '${accA}', 'segredo de A')`));
await as('authenticated', A, () => db.exec(`insert into notifications (kind, title, dedupe_key) values ('x', 'aviso de A', 'k')`));
const accB = await as('authenticated', B, async () => (await db.query(`insert into accounts (name, kind) values ('Conta B', 'checking') returning id`)).rows[0].id);

// ---- leitura
check('B não enxerga contas de A', (await as('authenticated', B, () => rows('select * from accounts'))).every((r) => r.name === 'Conta B'));
check('B não enxerga lançamentos de A', (await as('authenticated', B, () => rows('select * from transactions'))).length === 0);
check('B não enxerga categorias de A', (await as('authenticated', B, () => rows('select * from categories'))).length === 0);
check('B não enxerga avisos de A', (await as('authenticated', B, () => rows('select * from notifications'))).length === 0);
check('A enxerga os próprios dados', (await as('authenticated', A, () => rows('select * from transactions'))).length === 1);
check('lista de e-mails permitidos não é legível por usuário logado', (await as('authenticated', A, () => rows('select * from allowed_emails'))).length === 0);
check('lista de e-mails permitidos não é legível por anônimo', (await as('anon', null, () => rows('select * from allowed_emails'))).length === 0);
for (const t of ['accounts', 'transactions', 'categories', 'recurrences', 'notifications', 'investment_snapshots']) {
  check(`anônimo não lê ${t}`, (await as('anon', null, () => rows(`select * from ${t}`))).length === 0);
}

// ---- escrita
check('B não altera conta de A', (await as('authenticated', B, () => db.query(`update accounts set name = 'hack' where id = '${accA}' returning id`))).rows.length === 0);
check('B não apaga conta de A', (await as('authenticated', B, () => db.query(`delete from accounts where id = '${accA}' returning id`))).rows.length === 0);
check('B não apaga lançamentos de A', (await as('authenticated', B, () => db.query(`delete from transactions returning id`))).rows.length === 0);
check('B não grava com user_id de A', (await denied(`set role authenticated; set app.uid='${B}'`) , await as('authenticated', B, () => denied(`insert into accounts (user_id, name, kind) values ('${A}', 'forjada', 'checking')`))) === 'erro');
check('anônimo não consegue inserir', (await as('anon', null, () => denied(`insert into accounts (name, kind) values ('anon', 'checking')`))) === 'erro');
check('linha criada sem user_id fica com o do próprio usuário', (await as('authenticated', B, async () => (await db.query(`select user_id from accounts where id = '${accB}'`)).rows[0].user_id)) === B);

// ---- referências cruzadas entre usuários (defesa em profundidade)
const cross = async (label, sql) => check(label, (await as('authenticated', B, () => denied(sql))) === 'erro', 'B conseguiu referenciar dado de A');
await cross('B não cria lançamento numa conta de A', `insert into transactions (kind, amount, date, account_id) values ('expense', 1, '2026-10-01', '${accA}')`);
await cross('B não faz transferência para conta de A', `insert into transactions (kind, amount, date, account_id, to_account_id) values ('transfer', 1, '2026-10-01', '${accB}', '${accA}')`);
await cross('B não cria recorrência apontando para conta de A', `insert into recurrences (description, amount, kind, account_id, day_of_month, start_month) values ('x', 1, 'expense', '${accA}', 1, '2026-10')`);
await cross('B não grava saldo de investimento em conta de A', `insert into investment_snapshots (account_id, date, balance) values ('${accA}', '2026-10-01', 1)`);
await cross('B não usa categoria de A num lançamento', `insert into transactions (kind, amount, date, account_id, category_id) values ('expense', 1, '2026-10-01', '${accB}', '${catA}')`);
await cross('B não usa categoria de A numa recorrência', `insert into recurrences (description, amount, kind, account_id, category_id, day_of_month, start_month) values ('x', 1, 'expense', '${accB}', '${catA}', 1, '2026-10')`);

// ---- avisos: mesma chave em usuários diferentes é permitido
check('mesma chave de aviso em usuários diferentes não conflita', await as('authenticated', B, () => db.query(`insert into notifications (kind, title, dedupe_key) values ('x', 'aviso de B', 'k') returning id`)).then(() => true, () => false));
check('ping() funciona para anônimo (anti-pausa)', (await as('anon', null, () => rows('select public.ping() as t'))).length === 1);
// ---- sincronização: registro de exclusões
await as('authenticated', A, () => db.exec(`delete from notifications`));
check('A enxerga as próprias exclusões', (await as('authenticated', A, () => rows('select * from deleted_rows'))).some((r) => r.tbl === 'notifications'));
check('B não enxerga exclusões de A', (await as('authenticated', B, () => rows('select * from deleted_rows'))).length === 0);
check('anônimo não enxerga exclusões', (await as('anon', null, () => rows('select * from deleted_rows'))).length === 0);
check('ninguém grava direto em deleted_rows', (await as('authenticated', A, () => denied(`insert into deleted_rows (tbl, id, user_id) values ('x', gen_random_uuid(), '${A}')`))) !== false);
check('ninguém apaga registros de deleted_rows', (await as('authenticated', A, () => denied(`delete from deleted_rows`))) !== false);

console.log(failed ? `\n${failed} falha(s)` : '\ntodas as regras de acesso OK');
process.exit(failed ? 1 : 0);
