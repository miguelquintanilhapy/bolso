-- E-mails autorizados a criar conta no Bolso. Rode no SQL Editor.
-- Para adicionar alguém depois: insira outra linha (ou use o Table Editor → allowed_emails).
insert into public.allowed_emails (email) values
  ('miguelquintanilha61@gmail.com')
  -- , ('email-da-outra-pessoa@exemplo.com')
on conflict do nothing;
