# Ideias para depois

Anotadas pelo Miguel. **Nada disso foi feito ainda**; é só para não esquecer. Quando for a hora, conversar antes de começar.

## 1. Lançamento rápido por áudio
Falar em vez de digitar ("cinquenta no mercado") e cair no mesmo campo rápido.
- Ponto de partida: transcrever o áudio para texto e passar pelo mesmo `parseQuickEntry`, então a regra de categorias, contas, parcelas e datas não muda.
- Opções de transcrição: reconhecimento de voz do navegador (`SpeechRecognition`, grátis, mas o suporte no iPhone/Safari é limitado) ou um serviço externo (custo e privacidade a avaliar). A primeira versão do app foi definida sem IA, então decidir isso antes.
- Cuidados: números falados ("cinquenta", "vinte e três e noventa"), confirmar o que foi entendido antes de salvar, permissão de microfone (já está bloqueada no `vercel.json` em `Permissions-Policy`: precisa liberar `microphone=(self)`).

## 2. Notificações externas (push)
Avisos no celular mesmo com o app fechado (fatura vencendo, orçamento estourando, receita que entra hoje).
- Hoje os avisos só aparecem dentro do app (aba de notificações).
- Precisa de Web Push: permissão da pessoa, chaves VAPID, guardar a inscrição de cada aparelho no Supabase e algo no servidor que dispare (Supabase Edge Function + agendamento).
- iPhone: só funciona com o app instalado na tela de início (iOS 16.4 ou mais novo). Android/Chrome funciona direto.
- Reaproveitar `planNotifications` (já decide o que avisar) e a deduplicação por `dedupe_key`.

## 3. API de logos
Mostrar a logo do banco/cartão/estabelecimento no lugar do ícone genérico (Nubank, Itaú, Swile, iFood…).
- Onde: contas e cartões (hoje ícone + cor), e talvez a linha de cada lançamento pelo nome do estabelecimento.
- Avaliar serviços de logos (custo, limites, termos de uso e se ainda existem gratuitos) e os efeitos: a política de segurança (`img-src` no `vercel.json`) precisa liberar o domínio; imagens externas vazam quais lugares a pessoa usa, então considerar baixar e guardar uma cópia ou usar um conjunto fixo de bancos brasileiros.
