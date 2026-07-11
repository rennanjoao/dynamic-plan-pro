import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * useHighlightTarget
 *
 * Lê `?highlight=<id>` da URL, procura o elemento correspondente no DOM,
 * faz scroll suave até ele e aplica a classe `.highlight-target` por 2.5s.
 * Depois limpa o parâmetro da URL (replace) para não reaplicar em reload.
 *
 * Falha silenciosa se o elemento não existir (ex: item renomeado/removido
 * depois que o evento foi gerado).
 */
export function useHighlightTarget() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const target = params.get("highlight");
    if (!target) return;

    let cancelled = false;
    let removeTimer: ReturnType<typeof setTimeout> | null = null;

    // Espera um tick para o DOM da rota destino já ter renderizado a lista.
    const applyTimer = setTimeout(() => {
      if (cancelled) return;
      const el = document.getElementById(target);
      if (el) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          /* jsdom / navegadores antigos */
        }
        el.classList.add("highlight-target");
        removeTimer = setTimeout(() => {
          el.classList.remove("highlight-target");
        }, 2500);
      }
      // Limpa o parâmetro tenha achado ou não — falha silenciosa.
      const next = new URLSearchParams(location.search);
      next.delete("highlight");
      const qs = next.toString();
      navigate(
        { pathname: location.pathname, search: qs ? `?${qs}` : "" },
        { replace: true },
      );
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(applyTimer);
      if (removeTimer) clearTimeout(removeTimer);
    };
    // Só reage quando a query string muda — location.pathname já bate junto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
}

export default useHighlightTarget;