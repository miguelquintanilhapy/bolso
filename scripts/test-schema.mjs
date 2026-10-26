// Valida supabase/schema.sql num Postgres embutido (PGlite), com um stub mínimo do schema "auth".
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
`);
await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
await db.exec(readFileSync('supabase/schema.sql', 'utf8')); // idempotência
let failures = 0;
const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) failures++; };
const rejects = async (sql) => { try { await db.exec(sql); return false; } catch { return true; } };

check('cadastro bloqueado fora da lista', await rejects("insert into auth.users (email) values ('x@x.com')"));
await db.exec(readFileSync('supabase/seed_allowed_emails.sql', 'utf8'));
check('cadastro liberado na lista (case-insensitive)', !(await rejects("insert into auth.users (email) values ('MiguelQuintanilha61@Gmail.com')")));

const uid = (await db.query("select id from auth.users limit 1")).rows[0].id;
await db.exec(`set app.uid = '${uid}'`);
await db.exec(`insert into accounts (name, kind) values ('Conta', 'checking'), ('Cartão', 'credit')`);
const [a, b] = (await db.query('select id from accounts order by name')).rows.map((r) => r.id);
await db.exec(`insert into transactions (kind, amount, date, account_id) values ('expense', 10, '2026-10-01', '${a}')`);
check('transferência exige destino', await rejects(`insert into transactions (kind, amount, date, account_id) values ('transfer', 10, '2026-10-01', '${a}')`));
check('transferência não pode ser para a mesma conta', await rejects(`insert into transactions (kind, amount, date, account_id, to_account_id) values ('transfer', 10, '2026-10-01', '${a}', '${a}')`));
check('despesa não pode ter destino', await rejects(`insert into transactions (kind, amount, date, account_id, to_account_id) values ('expense', 10, '2026-10-01', '${a}', '${b}')`));
check('valor deve ser positivo', await rejects(`insert into transactions (kind, amount, date, account_id) values ('expense', 0, '2026-10-01', '${a}')`));

await db.exec(`insert into recurrences (description, amount, kind, account_id, day_of_month, start_month) values ('Aluguel', 1000, 'expense', '${a}', 5, '2026-10')`);
const rid = (await db.query('select id from recurrences')).rows[0].id;
await db.exec(`insert into transactions (kind, amount, date, account_id, recurrence_id, ref_month) values ('expense', 1000, '2026-10-05', '${a}', '${rid}', '2026-10')`);
check('recorrência não duplica no mês', await rejects(`insert into transactions (kind, amount, date, account_id, recurrence_id, ref_month) values ('expense', 1000, '2026-10-05', '${a}', '${rid}', '2026-10')`));
await db.exec(`insert into transactions (kind, amount, date, account_id) values ('expense', 5, '2026-10-02', '${a}'), ('expense', 5, '2026-10-02', '${a}')`);
check('lançamentos comuns não conflitam entre si', true);

await db.exec(`insert into notifications (kind, title, dedupe_key) values ('x', 'y', 'k1')`);
check('notificação com mesma chave é única', await rejects(`insert into notifications (kind, title, dedupe_key) values ('x', 'y', 'k1')`));
check('ping() responde', (await db.query('select public.ping() as t')).rows[0].t != null);

// sincronização incremental: updated_at muda a cada alteração e exclusões ficam registradas
const stamp = async () => (await db.query(`select updated_at from accounts where id = '${a}'`)).rows[0].updated_at.getTime();
const t1 = await stamp();
await new Promise((r) => setTimeout(r, 15));
await db.exec(`update accounts set name = 'Conta 2' where id = '${a}'`);
check('updated_at avança quando a linha muda', (await stamp()) > t1);
await db.exec(`update accounts set updated_at = '2000-01-01' where id = '${a}'`);
check('updated_at não pode ser falsificado', (await stamp()) > Date.parse('2020-01-01'));
await db.exec(`delete from transactions where account_id = '${b}'`);
await db.exec(`insert into transactions (kind, amount, date, account_id) values ('expense', 1, '2026-10-03', '${b}')`);
const doomed = (await db.query(`select id from transactions where account_id = '${b}'`)).rows[0].id;
await db.exec(`delete from accounts where id = '${b}'`); // exclui em cascata o lançamento do cartão
const tomb = (await db.query(`select tbl, id from deleted_rows`)).rows;
check('exclusão da conta fica registrada', tomb.some((r) => r.tbl === 'accounts' && r.id === b));
check('exclusão em cascata também fica registrada', tomb.some((r) => r.tbl === 'transactions' && r.id === doomed));

console.log(failures ? `\n${failures} falha(s)` : '\nschema OK');
process.exit(failures ? 1 : 0);
