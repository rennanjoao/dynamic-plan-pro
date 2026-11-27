// Chamada da exclusão de conta + dados (LGPD). A regra de quem pode excluir
// fica no servidor (edge function delete-student-account).
import { supabase } from "@/integrations/supabase/client";

export const DELETE_CONFIRM_WORD = "EXCLUIR";

export type DeleteResult = { ok: true; filesFailed: boolean } | { ok: false; error: string };

export async function deleteStudentAccount(studentId: string): Promise<DeleteResult> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; filesFailed?: boolean }>(
    "delete-student-account",
    { body: { studentId, confirm: DELETE_CONFIRM_WORD } },
  );
  if (error) {
    // Erro 4xx/5xx: a mensagem em português vem no corpo da resposta.
    let msg = "Não foi possível excluir agora. Tente de novo.";
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json() : null;
      if (body?.error) msg = String(body.error);
    } catch { /* mantém a mensagem padrão */ }
    return { ok: false, error: msg };
  }
  if (!data?.ok) return { ok: false, error: data?.error || "Não foi possível excluir agora. Tente de novo." };
  return { ok: true, filesFailed: !!data.filesFailed };
}
