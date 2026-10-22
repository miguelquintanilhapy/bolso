# Bolso

Assistente financeiro pessoal, gratuito e privado, feito para duas pessoas com dados totalmente separados.
App web instalável no iPhone (PWA), com banco e login no Supabase e hospedagem no Vercel (ambos no plano gratuito).

## O que faz

- **Contas:** conta corrente, cartão de crédito (fechamento, vencimento, fatura mensal, pagamento da fatura) e investimentos (saldo atualizado manualmente, com histórico).
- **Lançamentos:** receitas, despesas e transferências, com categoria, tags, observação e situação pago/pendente. Parcelamento (`3x`), recorrências (aluguel, assinaturas) geradas automaticamente, busca e filtros, e "desfazer" ao apagar.
- **Campo rápido (sem IA):** digite no início da tela e ele registra por regras fixas.

  | Digite | Resultado |
  |---|---|
  | `50 mercado` | despesa de R$ 50 em Alimentação |
  | `uber 23,90` | despesa em Transporte |
  | `+3000 salário` | receita em Salário |
  | `300 tv 3x cartão` | R$ 300 em 3 parcelas no cartão |
  | `ontem 12 padaria #trabalho` | com data e tag |

  Palavra desconhecida abre o formulário já preenchido e, ao salvar, o Bolso aprende a palavra.
- **Orçamento:** limite mensal por categoria, com anel/barra de progresso e avisos a 80% e 100%.
- **Saldo previsto do mês:** disponível agora ± pendentes do mês − faturas a vencer.
- **Insights:** resumo do mês por categoria, evolução mensal e patrimônio ao longo do tempo.
- **Notificações dentro do app:** orçamento, faturas e contas a vencer. (Push no iPhone fica para a v1.5.)
- **Ocultar valores** (olho), tema claro/escuro, exportação CSV e backup JSON.

## Configurar

Passo a passo completo em [docs/SETUP.md](docs/SETUP.md).

## Desenvolver

```bash
npm install
npm run dev          # sem .env.local o app roda em modo demonstração (dados locais); use /?demo para dados de exemplo
npm run check        # typecheck + testes da lógica + teste do schema SQL
npm run build
```

Para o teste de interface no navegador (precisa de um Chromium): `npm run build && npx vite preview --port 4173` e, em outro terminal,
`CHROMIUM_PATH=/caminho/do/chrome node scripts/e2e.mjs http://localhost:4173 ./prints`.

## Estrutura

- `src/lib/` — lógica financeira pura e testada (saldos, faturas, parcelas, orçamento, previsão, campo rápido, recorrências, avisos).
- `src/data/` — camada de dados: Supabase e modo demo local com a mesma interface.
- `src/pages/`, `src/ui/` — telas e componentes.
- `supabase/schema.sql` — tabelas, regras de segurança por linha e bloqueio de cadastro por lista de e-mails.
- `.github/workflows/keepalive.yml` — chamada diária que evita a pausa do projeto gratuito do Supabase.
