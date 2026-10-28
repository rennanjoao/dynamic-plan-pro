/**
 * useWhatsNew.ts — acesso a dados do recurso "Novidades".
 * Usa o client sem tipos (`sb`) porque as tabelas novas ainda não estão em
 * integrations/supabase/types.ts (gerado pelo Lovable após a migração).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import type { Announcement } from "@/lib/whatsNew";

/** Avisos pendentes do usuário logado (a função já filtra tudo no banco). */
export async function fetchPendingAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await sb.rpc("get_pending_announcements", { p_audience: "student" });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

/**
 * Marca como visto. INSERT ... ON CONFLICT DO NOTHING: idempotente e só exige
 * a policy de INSERT. Falha silenciosa (no pior caso o aviso reaparece).
 */
export async function markAnnouncementsSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    const { error } = await sb
      .from("announcement_views")
      .upsert(
        ids.map((announcement_id) => ({ announcement_id, user_id: uid })),
        { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
      );
    if (error) console.warn("[whatsNew] não foi possível marcar como visto:", error.message);
  } catch (e) {
    console.warn("[whatsNew] falha ao marcar como visto:", e);
  }
}

/** Histórico: tudo que já foi publicado para alunos (RLS já filtra rascunhos). */
export function useAnnouncementHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["whats-new", "history"],
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await sb
        .from("app_announcements")
        .select("*")
        .in("audience", ["student", "all"])
        .order("published_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}
