-- Correções da auditoria de controle de acesso (2026-09-06).
-- Cobre os achados #2 (subscriptions com UPDATE liberado a qualquer
-- autenticado) e #6 (has_role aceitando qualquer _user_id), além de criar a
-- infraestrutura de rate limit usada pelas Edge Functions (achados #4 e #7).

-- ─────────────────────────────────────────────────────────────────────────
-- #2: subscriptions — a policy antiga liberava UPDATE pra qualquer papel
-- (USING (true), sem TO, sem WITH CHECK). Nenhum código atual (src/ ou
-- Edge Functions) lê/escreve essa tabela — foi substituída por
-- student_subscriptions — então restringir a service_role não quebra nada
-- em uso hoje.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "System can update subscriptions" ON public.subscriptions;

CREATE POLICY "Service role can update subscriptions"
  ON public.subscriptions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE ON public.subscriptions FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- #6: has_role(_user_id, _role) respondia para QUALQUER _user_id informado,
-- não só o do próprio chamador — dava pra usar como "esse UUID é admin?"
-- em massa. Todos os ~9 pontos do código que chamam essa RPC (AdminGuard,
-- CoachGuard, Auth.tsx, Index.tsx, manage-trainers, etc.) já mandam sempre
-- o próprio auth.uid() como _user_id — então a trava abaixo não muda nada
-- pra eles e fecha a brecha pra qualquer outro uso. service_role (chamadas
-- feitas com a chave de backend) continua podendo perguntar sobre
-- qualquer usuário, já que isso é necessário internamente.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Infraestrutura de rate limit (usada por resolve-referral-coach e
-- info-chat). Um contador por "bucket" (ex.: "info-chat:1.2.3.4") e janela
-- de tempo fixa; upsert atômico evita corrida entre requisições paralelas.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM authenticated, anon, public;
GRANT ALL ON public.rate_limit_hits TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text, _max_hits int, _window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _hits int;
BEGIN
  _window_start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limit_hits (bucket, window_start, hits)
  VALUES (_bucket, _window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = rate_limit_hits.hits + 1
  RETURNING hits INTO _hits;

  -- limpeza oportunista das janelas antigas — dispensa um cron dedicado.
  DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '1 hour';

  RETURN _hits <= _max_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
