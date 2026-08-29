import { supabase } from "@/integrations/supabase/client";

export interface NotifyCoachInput {
  /**
   * Nunca é usado pelo servidor para decidir para quem notificar — a
   * function notify-coach sempre resolve o coach (e o e-mail dele) a partir
   * do aluno autenticado, via coach_students/profiles. Mantido só como
   * campo legado/opcional; não use para decidir se deve chamar notifyCoach.
   */
  coachEmail?: string;
  studentName?: string;
  studentEmail?: string;
  kind: "anamnesis" | "checkin" | "question";
  subject?: string;
  summary?: string;
  data?: Record<string, unknown>;
  photos?: Record<string, string>;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500]; // entre a 1ª→2ª e a 2ª→3ª tentativa

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Notifica o coach (sino em coach_notifications + e-mail best-effort) sobre
 * um evento do aluno.
 *
 * A function notify-coach grava o sino do coach já na primeira execução —
 * antes mesmo de tentar o e-mail — e só então decide se envia (ou não)
 * o e-mail. Por isso, qualquer resposta com corpo JSON (`ok:true` ou
 * `ok:false` com um motivo conhecido: sem coach vinculado, coach sem
 * e-mail, Resend indisponível etc.) é definitiva: repetir a chamada não
 * mudaria o resultado e só arriscaria duplicar a notificação no sino.
 * Retentamos aqui SOMENTE quando a chamada não voltou com corpo algum —
 * exceção de rede/timeout ou a function não respondeu (5xx do runtime) —
 * porque esses são os únicos casos em que ainda não sabemos se o sino foi
 * gravado.
 */
export async function notifyCoach(input: NotifyCoachInput): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("notify-coach", {
        body: input,
      });

      if (data && typeof data === "object") {
        // Resposta definitiva do servidor — não repetir, seja ok:true ou ok:false.
        return (data as { ok?: boolean }).ok === true;
      }
      if (error) console.error(`notify-coach sem resposta utilizável (tentativa ${attempt}/${MAX_ATTEMPTS})`, error);
    } catch (e) {
      console.error(`notify-coach exceção de transporte (tentativa ${attempt}/${MAX_ATTEMPTS})`, e);
    }

    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1500);
  }

  return false;
}
