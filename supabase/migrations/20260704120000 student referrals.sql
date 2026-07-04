-- Sistema de indicação aluno→aluno (referral loop do WorkoutShareCard)
-- Fluxo completo:
--   1) Aluno finaliza treino → WorkoutShareCard mostra QR com ?ref=<código>
--   2) Novo visitante escaneia → cai em eliteprimehub.com.br?ref=...
--   3) src/lib/referralCapture.ts guarda o código no localStorage (30 dias)
--   4) No cadastro (Anamnesis.tsx), a edge function register-referral resolve
--      o código e grava o vínculo — sempre via service role, nunca client direto.

-- 1) Código curto e único por aluno, usado no QR/link de compartilhamento
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_student_profiles_referral_code
  ON public.student_profiles (referral_code);

-- 2) Tabela de indicações
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  coach_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ref_code text NOT NULL,
  status text NOT NULL DEFAULT 'converted' CHECK (status IN ('converted', 'rewarded', 'voided')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_referred_user_unique UNIQUE (referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_student_id);
CREATE INDEX IF NOT EXISTS idx_referrals_coach ON public.referrals (coach_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Aluno vê as indicações que ele mesmo trouxe (para exibir "N amigos indicados")
CREATE POLICY referrals_select_own_referrer ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_student_id);

-- Coach vê as indicações vinculadas ao seu ecossistema (para o painel de billing/comissão)
CREATE POLICY referrals_select_own_coach ON public.referrals
  FOR SELECT USING (auth.uid() = coach_id);

-- Nenhum INSERT/UPDATE/DELETE direto do client — tudo passa pela edge function
-- register-referral (service role). Isso impede um aluno de forjar indicações
-- e "farmar" bônus de referral inserindo linhas manualmente via client.
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM authenticated, anon;

-- 3) Gera (ou retorna, se já existir) o código de indicação do próprio aluno.
--    SECURITY DEFINER: student_profiles.referral_code precisa ser lido/gravado
--    de forma atômica sem abrir UPDATE direto na tabela para o client.
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_attempt int := 0;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT referral_code INTO v_code
  FROM public.student_profiles
  WHERE user_id = p_user_id;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := upper(substr(md5(p_user_id::text || clock_timestamp()::text || v_attempt::text), 1, 7));

    BEGIN
      UPDATE public.student_profiles
      SET referral_code = v_code
      WHERE user_id = p_user_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt > 5 THEN
        RAISE EXCEPTION 'referral_code_generation_failed';
      END IF;
    END;
  END LOOP;

  RETURN v_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_referral_code(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code(uuid) TO authenticated;

-- 4) Resolve um ref_code para o student_id de quem indicou — usado apenas pela
--    edge function register-referral (service_role). Nunca exposto ao client,
--    para que ninguém consiga varrer códigos válidos por força bruta.
CREATE OR REPLACE FUNCTION public.resolve_referral_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_referrer uuid;
BEGIN
  SELECT user_id INTO v_referrer
  FROM public.student_profiles
  WHERE referral_code = upper(trim(p_code));

  RETURN v_referrer;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_referral_code(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO service_role;
