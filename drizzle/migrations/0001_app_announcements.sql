CREATE TABLE IF NOT EXISTS public.app_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  audience      text NOT NULL DEFAULT 'student',
  slides        jsonb NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  published_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_announcements_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT app_announcements_title_len CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT app_announcements_audience CHECK (audience IN ('student', 'coach', 'all')),
  CONSTRAINT app_announcements_slides_shape CHECK (jsonb_typeof(slides) = 'array' AND jsonb_array_length(slides) BETWEEN 1 AND 4)
);

CREATE TABLE IF NOT EXISTS public.announcement_views (
  announcement_id uuid NOT NULL REFERENCES public.app_announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS announcement_views_user_idx ON public.announcement_views (user_id);

CREATE OR REPLACE FUNCTION public.app_announcements_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.is_active AND NOT OLD.is_active THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS app_announcements_before_write ON public.app_announcements;
CREATE TRIGGER app_announcements_before_write BEFORE INSERT OR UPDATE ON public.app_announcements
  FOR EACH ROW EXECUTE FUNCTION public.app_announcements_before_write();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_announcements TO authenticated;
GRANT ALL ON public.app_announcements TO service_role;
GRANT SELECT, INSERT ON public.announcement_views TO authenticated;
GRANT ALL ON public.announcement_views TO service_role;

ALTER TABLE public.app_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read published announcements" ON public.app_announcements;
CREATE POLICY "Authenticated can read published announcements" ON public.app_announcements FOR SELECT TO authenticated
  USING (is_active AND published_at <= now());
DROP POLICY IF EXISTS "Admins manage announcements" ON public.app_announcements;
CREATE POLICY "Admins manage announcements" ON public.app_announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users read own announcement views" ON public.announcement_views;
CREATE POLICY "Users read own announcement views" ON public.announcement_views FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own announcement views" ON public.announcement_views;
CREATE POLICY "Users insert own announcement views" ON public.announcement_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins read all announcement views" ON public.announcement_views;
CREATE POLICY "Admins read all announcement views" ON public.announcement_views FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_pending_announcements(p_audience text DEFAULT 'student')
RETURNS SETOF public.app_announcements LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT a.*
  FROM public.app_announcements a
  JOIN public.profiles p ON p.user_id = auth.uid()
  WHERE p.onboarding_seen_at IS NOT NULL
    AND a.is_active
    AND a.published_at <= now()
    AND a.published_at > p.onboarding_seen_at
    AND (a.expires_at IS NULL OR a.expires_at > now())
    AND a.audience IN (p_audience, 'all')
    AND NOT EXISTS (SELECT 1 FROM public.announcement_views v WHERE v.announcement_id = a.id AND v.user_id = auth.uid())
  ORDER BY a.published_at ASC
  LIMIT 2;
$$;
REVOKE ALL ON FUNCTION public.get_pending_announcements(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_announcements(text) TO authenticated;

INSERT INTO public.app_announcements (slug, title, audience, is_active, slides)
VALUES (
  'sos-tpm-e-guia-do-treino',
  'S.O.S TPM mais completo e guia do treino',
  'student',
  false,
  $json$[
    {
      "icon": "heart",
      "title": "S.O.S TPM mais completo",
      "body": "A sua válvula de escape foi reorganizada: as opções vão do mais natural ao mais processado e agora há uma seção de trocas de refeição.\n\nLembre: é uma válvula de escape, não faz parte da dieta diária. Escolha, meça a porção e siga o protocolo normalmente no dia seguinte.",
      "cta": { "label": "Abrir o S.O.S TPM", "route": "/routine?highlight=tool-tpm" }
    },
    {
      "icon": "book-open",
      "title": "Como ler o seu treino",
      "body": "Na tela de Treino há um botão “Como ler meu treino” com um guia rápido: como fazer o aquecimento (Série Zero), o que significa ir até a falha e o que fazer se você faltar a um treino.\n\nToque nele sempre que bater a dúvida.",
      "cta": { "label": "Ver meu treino", "route": "/workout-plan" }
    }
  ]$json$::jsonb
)
ON CONFLICT (slug) DO NOTHING;