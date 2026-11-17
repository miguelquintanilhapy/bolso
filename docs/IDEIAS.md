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

## 3. Logos de bancos (feito)
Feito: a conta ganha a logo do banco pelo nome ("Nubank Cartão", "Itaú"…).
- Nubank, PicPay e Mercado Pago vêm embutidos no app (`simple-icons`, SVG, sem rede). As demais marcas usam o ícone do site do banco (Google), com cache do navegador.
- Se não carregar (offline, bloqueado), cai no ícone do tipo da conta.
- Dá para desligar em **Mais → Logos dos bancos**; desligado, nada é buscado.
- A política de segurança (`img-src` em `vercel.json`) libera só `www.google.com` e `*.gstatic.com` para imagens.
- Ideia futura: embutir mais marcas (Itaú, Inter, C6, Bradesco…) para não depender de rede, e baixar o ícone do site uma vez e guardá-lo no aparelho.
