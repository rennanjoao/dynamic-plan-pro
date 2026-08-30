import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Encapsula o padrão repetido nas páginas do aluno:
 *   supabase.auth.getSession() → setUserId → (opcional) redirect para /auth
 *
 * Suporta Modo Espelho: com ?previewAs=<student_id> na URL, o coach segue
 * autenticado como ele mesmo — só o id-alvo das queries muda.
 */
export function useAuthUserId(options?: { redirectTo?: string }): string {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");
  const [userId, setUserId] = useState("");
  const redirectTo = options?.redirectTo;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sessionUid = data.session?.user?.id;
      if (!sessionUid) {
        if (redirectTo) navigate(redirectTo);
        return;
      }
      setUserId(previewAs || sessionUid);
    });
  }, [navigate, redirectTo, previewAs]);

  return userId;
}
