-- LGPD (incidente): até 27/11/2026 o cadastro gravava a senha do aluno em texto
-- dentro de anamnesis.payload ("senha"). O cadastro novo já não grava.
-- Esta migração remove só esse campo das fichas antigas. O login do aluno não
-- muda (a senha de verdade fica no Auth, criptografada).
-- A quantidade de fichas afetadas fica registrada em admin_audit_log
-- (action = 'lgpd-remove-plaintext-passwords'), sem nenhum dado pessoal.
DO $$
DECLARE n bigint;
BEGIN
  UPDATE public.anamnesis
     SET payload = payload - 'senha'
   WHERE payload ? 'senha';
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.admin_audit_log (action, details)
  VALUES ('lgpd-remove-plaintext-passwords', jsonb_build_object('fichas_corrigidas', n, 'em', now()));

  RAISE NOTICE 'Fichas com senha removida: %', n;
END $$;