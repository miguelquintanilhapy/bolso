<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo-white.png">
  <img src="public/logo.png" alt="Bolso" width="200">
</picture>

### Finanças pessoais que cabem no bolso: rápido de usar, privado e gratuito.

PWA instalável no celular · sem anúncios · sem IA · dados separados por pessoa

<br />

![React](https://img.shields.io/badge/React_19-20232a?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?style=for-the-badge&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_+_RLS-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5a0fc8?style=for-the-badge&logo=pwa&logoColor=white)

**[▶ Experimentar agora (sem criar conta)](https://bolso-delta.vercel.app/?demo)** &nbsp;·&nbsp; [Configuração](docs/SETUP.md) &nbsp;·&nbsp; [Como funciona](#como-é-no-dia-a-dia) 

<br />

<img src="docs/img/inicio-light.png" alt="Início" width="185" />
<img src="docs/img/extrato-light.png" alt="Extrato" width="185" />
<img src="docs/img/orcamento-light.png" alt="Orçamento" width="185" />
<img src="docs/img/cartao-light.png" alt="Cartão de crédito" width="185" />

</div>

---

## Por que o Bolso existe

Apps de finanças ou são pesados, ou cobram, ou mostram anúncios, ou exigem preencher dez campos para registrar um café.
O Bolso nasceu para duas pessoas que queriam **responder rápido** às perguntas que importam:

> *Quanto eu tenho? Quanto ainda vai sair este mês? Quanto posso gastar? Para onde o dinheiro foi?*

Lançar um gasto leva **uma linha de texto** (`50 mercado`), a tela inicial já mostra **o saldo previsto para o fim do mês**,
e tudo roda nos **planos gratuitos** do Supabase e da Vercel.

## Destaques do produto

| | |
|---|---|
| ⚡ **Campo rápido, sem IA** | `50 mercado`, `uber 23,90`, `+3000 salário`, `300 tv 3x cartão`, `ontem 12 padaria #trabalho`. Regras claras, palavras-chave que o app aprende e **valor padrão por palavra** (`cantina` já lança R$ 15,50). |
| 💳 **Cartões e faturas de verdade** | Fechamento, vencimento, fatura de cada mês (inclusive parcelas futuras), pagamento da fatura e limite em um cartão visual. |
| 🎯 **Orçamento com ritmo** | Limite por categoria, avisos a 80% e 100% e leitura do ritmo: *"você já usou 60% do orçamento com 30% do mês"*. |
| 🔮 **Previsão do mês** | Disponível agora ± pendentes − faturas a vencer, e "Ainda neste mês": quanto ainda vai sair e entrar. |
| 🗂️ **Categorias inteligentes** | Sugestões do histórico, regras por conta (vale-alimentação só aceita alimentação), reordenar, arquivar e mesclar ao apagar, com "Desfazer". |
| 📊 **Insights** | Gasto por categoria e por tag, evolução mensal e patrimônio ao longo do tempo. |
| 📲 **Experiência de app** | Instala na tela inicial, abre na hora com cache local, atualiza sozinho com segurança, modo escuro, ocultar valores, atalhos de teclado e exportação CSV/JSON. |

<div align="center">

<img src="docs/img/categorias-light.png" alt="Categorias" width="200" />
<img src="docs/img/inicio-dark.png" alt="Início no modo escuro" width="200" />

</div>

## Experimente em 10 segundos

Abra **[bolso-delta.vercel.app/?demo](https://bolso-delta.vercel.app/?demo)**: o modo demonstração roda inteiro no seu navegador, com dados de exemplo e **sem enviar nada a servidor**.
Digite `45 almoço` no campo do topo, deslize uma linha para pagar ou apagar, abra um cartão e olhe o orçamento.

## Como é no dia a dia

1. **Você digita** `45 almoço` (ou toca no cartão e digita `480 vr`).
2. **O Bolso entende:** valor, categoria, conta, data e parcelas, sem formulário.
3. **Você enxerga:** o orçamento reage, o previsto do mês se atualiza e o cartão mostra o limite que sobrou.

Sem planilha, sem fricção, sem ninguém olhando seus dados.

## Privado de verdade

- **Seus dados são só seus:** cada pessoa enxerga apenas o que lançou, e isso é garantido pelo próprio banco.
- **Sem anúncios, sem rastreadores e sem IA:** nada sai do seu banco para serviços de terceiros.
- **Leve para levar:** exporta tudo em CSV e JSON quando quiser, e o Bolso nunca apaga nada por conta própria.
- **Funciona onde você está:** celular, tablet e computador, em claro e escuro.

## Feito com

React 19 · TypeScript · Vite · Supabase (Postgres) · Vercel · PWA

## Para quem quer rodar o projeto

```bash
npm install
npm run dev          # sem .env.local roda em modo demonstração; use /?demo para dados de exemplo
```

Para conectar a um banco de verdade, crie `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave **anon/publishable**) e rode `supabase/schema.sql` no SQL Editor (o arquivo é idempotente). Passo a passo completo, com Vercel e instalação no iPhone, em **[docs/SETUP.md](docs/SETUP.md)**.

<details>
<summary><b>Comandos de teste e qualidade</b></summary>

```bash
npm run check          # tipos + testes da lógica + teste do schema SQL
npm run test:schema    # schema, gatilhos e regras do banco num Postgres embutido
npm run qa:rls         # um usuário nunca enxerga os dados do outro

# precisam de um Chromium (CHROMIUM_PATH=/caminho/do/chrome) e do app em http://localhost:4173
npm run build && npx vite preview --port 4173
node scripts/e2e.mjs                 # ponta a ponta
node scripts/qa/a11y.mjs             # acessibilidade (axe-core)
npm run qa:layout && npm run qa:desktop
npm run qa:perf                      # desempenho com milhares de lançamentos
npm run qa:update                    # atualização automática do app
```

</details>

<details>
<summary><b>Estrutura do código</b></summary>

```
src/
  lib/       lógica financeira pura e testada (saldos, faturas, parcelas, orçamento, previsão,
             campo rápido, recorrências, sugestões, regras de categoria, avisos)
  data/      camada de dados: Supabase e modo demo, com a mesma interface
  pages/     telas (Início, Extrato, Orçamento, Insights, Contas, Categorias…)
  ui/        componentes (editores, folhas, gráficos, campo de valor, busca…)
supabase/    schema.sql (tabelas, RLS, gatilhos)
scripts/     testes de interface, acessibilidade, desempenho e geração de ícones
docs/        configuração (SETUP.md) e ideias futuras (IDEIAS.md)
```

</details>

## O que vem por aí

Lançamento por voz, notificações push com o app fechado e logos de bancos estão em [docs/IDEIAS.md](docs/IDEIAS.md).
Para ter o app nas lojas, o caminho é empacotar o mesmo código com Capacitor, sem reescrever nada.


---

<div align="center">

Feito por [@miguelquintanilhapy](https://github.com/miguelquintanilhapy)

</div>
