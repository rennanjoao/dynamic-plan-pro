import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Encapsula o padrão repetido nas páginas do aluno:
 *   supabase.auth.getSession() → setUserId → (opcional) redirect para /auth
 *
 * Preserva 100% do comportamento anterior. Retorna string vazia enquanto
 * a sessão ainda não foi resolvida (compatível com `enabled: !!userId`).
 */
export function useAuthUserId(options?: { redirectTo?: string }): string {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const redirectTo = options?.redirectTo;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (uid) setUserId(uid);
      else if (redirectTo) navigate(redirectTo);
    });
  }, [navigate, redirectTo]);

  return userId;
}