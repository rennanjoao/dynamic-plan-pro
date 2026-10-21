import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { activityAreaForPath, isNewAppOpen } from "@/lib/activityArea";

const LAST_ACTIVE_KEY = "elite_last_active_at";

/**
 * Registra o tempo visível do aluno por área (treino, dieta, suplementos...).
 * Ignora Modo Espelho (previewAs) para não contar o coach como aluno.
 */
export default function StudentActivityTracker() {
  const location = useLocation();

  useEffect(() => {
    const area = activityAreaForPath(location.pathname);
    if (!area) return;
    if (new URLSearchParams(location.search).get("previewAs")) return;

    let cancelled = false;
    let rowId: string | null = null;
    let userId: string | null = null;
    let startedAt = Date.now();
    let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let accumulated = 0;

    const elapsed = () => Math.round((accumulated + (visibleSince ? Date.now() - visibleSince : 0)) / 1000);

    const flush = () => {
      if (!rowId || !userId) return;
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
      void sb.from("student_activity_sessions")
        .update({ ended_at: new Date(now).toISOString(), duration_seconds: Math.min(elapsed(), 86400) })
        .eq("id", rowId);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid || cancelled) return;
      userId = uid;
      const now = Date.now();
      const last = Number(localStorage.getItem(LAST_ACTIVE_KEY)) || null;
      localStorage.setItem(LAST_ACTIVE_KEY, String(now));
      startedAt = now;
      const { data: row } = await sb.from("student_activity_sessions")
        .insert({ student_id: uid, area, route: location.pathname, is_app_open: isNewAppOpen(last, now), started_at: new Date(startedAt).toISOString() })
        .select("id").single();
      if (!cancelled && row) rowId = (row as { id: string }).id;
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (visibleSince === null) visibleSince = Date.now();
      } else if (visibleSince !== null) {
        accumulated += Date.now() - visibleSince;
        visibleSince = null;
        flush();
      }
    };
    const interval = window.setInterval(flush, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      cancelled = true;
      flush();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [location.pathname, location.search]);

  return null;
}
