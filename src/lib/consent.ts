/**
 * consent.ts — consentimento LGPD para dados de saúde e fotos (art. 11).
 * O aceite fica em `consent_records` (uma linha por aceite, hora do servidor).
 * Mudou o texto? Troque CONSENT_VERSION: todo aluno aceita de novo uma vez.
 */
import { sb } from "@/integrations/supabase/untyped";

export const CONSENT_VERSION = "2026-11-27";
export const CONSENT_KIND = "health_data_photos";
export const CONSENT_TEXT = "Autorizo o uso dos meus dados de saúde e fotos para montar meu protocolo.";
export const GUARDIAN_CONSENT_TEXT =
  "Sou o responsável legal por este aluno menor de 18 anos e autorizo o uso dos dados de saúde e fotos dele para montar o protocolo.";

/** Grava o aceite do usuário logado. Lança erro se o servidor recusar. */
export async function recordConsent(userId: string, opts: { guardianName?: string | null } = {}): Promise<void> {
  const guardian = (opts.guardianName ?? "").trim();
  const { error } = await sb.from("consent_records").insert({
    user_id: userId,
    kind: CONSENT_KIND,
    version: CONSENT_VERSION,
    text_shown: guardian ? `${CONSENT_TEXT}\n${GUARDIAN_CONSENT_TEXT}` : CONSENT_TEXT,
    guardian_name: guardian || null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) throw error;
}

/**
 * O usuário já aceitou a versão atual? `null` quando não deu para saber
 * (sem internet, tabela ainda não criada) — quem chama não deve bloquear nesse caso.
 */
export async function hasCurrentConsent(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await sb
      .from("consent_records")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", CONSENT_KIND)
      .eq("version", CONSENT_VERSION)
      .limit(1);
    if (error) return null;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return null;
  }
}

export interface ConsentState {
  accepted: boolean;
  minor: boolean;
  guardianName: string;
  guardianAccepted: boolean;
}

/** Mensagem do que falta, ou null quando o consentimento está completo. */
export function consentIssue(s: ConsentState): string | null {
  if (!s.accepted) return "Para continuar, marque a autorização de uso dos dados de saúde e fotos.";
  if (s.minor) {
    if (s.guardianName.trim().length < 3) return "Aluno menor de 18 anos: informe o nome do responsável legal.";
    if (!s.guardianAccepted) return "Aluno menor de 18 anos: o responsável legal precisa marcar a autorização.";
  }
  return null;
}
