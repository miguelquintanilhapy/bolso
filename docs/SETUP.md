# Configuração do Bolso

Tempo estimado: 15 minutos. Tudo é gratuito.

## 1. Banco de dados (Supabase)

1. No painel do projeto, abra **SQL Editor → New query**.
2. Cole **todo** o conteúdo de `supabase/schema.sql` e clique em **Run**. Pode rodar de novo sem problema.
3. Em outra query, cole `supabase/seed_allowed_emails.sql` e rode. Ele libera o seu e-mail.
   Para liberar a outra pessoa, adicione o e-mail dela no arquivo (ou em **Table Editor → allowed_emails**) e rode de novo.
   Só e-mails dessa lista conseguem criar conta.

## 2. Login (Supabase)

Em **Authentication → Sign In / Providers → Email**:

- Desligue **Confirm email**. Com duas pessoas, é mais simples e evita depender do envio de e-mails.
- Mantenha **Allow new users to sign up** ligado até as duas contas serem criadas. Depois pode desligar; a lista de e-mails já protege de qualquer forma.

Então abra o app, toque em **Criar conta** e use o e-mail liberado e uma senha de 8+ caracteres.

## 3. Variáveis no Vercel

No projeto, **Settings → Environment Variables**, crie (para Production, Preview e Development):

| Nome | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto, no formato `https://<id>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | chave **anon / publishable** |

As variáveis `NEXT_PUBLIC_*` criadas pela integração Supabase↔Vercel podem ficar, mas o Bolso usa os nomes `VITE_*`.
**Nunca use a chave `service_role`.** Depois de salvar, faça **Redeploy** para as variáveis valerem.

## 4. Evitar a pausa do Supabase gratuito

O Supabase gratuito pausa o projeto após cerca de 1 semana sem acesso. A rotina em `.github/workflows/keepalive.yml` faz uma chamada por dia.
No GitHub, em **Settings → Secrets and variables → Actions → New repository secret**, crie:

- `SUPABASE_URL` com a mesma URL do passo 3
- `SUPABASE_ANON_KEY` com a mesma chave anon

Agendamentos do GitHub só rodam na branch padrão (`main`), então a rotina começa a valer depois do merge.
Para testar na hora: **Actions → Manter Supabase ativo → Run workflow**.

## 5. Instalar no iPhone

1. Abra o endereço do Vercel no **Safari** (precisa ser o Safari).
2. Toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
3. O Bolso aparece como app, em tela cheia, com ícone próprio.

## Notas

- O Bolso nunca apaga seus dados por conta própria. Em **Mais → Seus dados** há exportação em CSV e backup em JSON.
- Para rodar localmente conectado ao banco, copie `.env.example` para `.env.local` e preencha.
