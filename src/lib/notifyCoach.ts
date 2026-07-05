import { supabase } from "@/integrations/supabase/client";

export interface NotifyCoachInput {
  coachEmail: string;
  studentName?: string;
  studentEmail?: string;
  kind: "anamnesis" | "checkin" | "question";
  subject?: string;
  summary?: string;
  data?: Record<string, unknown>;
  photos?: Record<string, string>;
}

const NOTIFY_QUEUE_KEY = "notify_coach_pending_queue";
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500]; // entre a 1ª→2ª e a 2ª→3ª tentativa

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Guarda a notificação que falhou mesmo após as retentativas, para não perdê-la
// silenciosamente. Não é uma fila com sincronização automática — é uma rede de
// segurança para diagnóstico/reenvio manual (evita que uma falha de rede na
// função de notificação vire uma notificação de saúde/progresso perdida para sempre).
function queueFailedNotification(input: NotifyCoachInput) {
  try {
    const raw = localStorage.getItem(NOTIFY_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...input, failedAt: Date.now() });
    localStorage.setItem(NOTIFY_QUEUE_KEY, JSON.stringify(queue.slice(-20)));
  } catch {
    // noop — localStorage indisponível/cheio
  }
}

export async function notifyCoach(input: NotifyCoachInput): Promise<boolean> {
  if (!input.coachEmail) return false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("notify-coach", {
        body: input,
      });
      if (!error && (data as { ok?: boolean })?.ok) return true;
      if (error) console.error(`notify-coach error (tentativa ${attempt}/${MAX_ATTEMPTS})`, error);
    } catch (e) {
      console.error(`notify-coach exception (tentativa ${attempt}/${MAX_ATTEMPTS})`, e);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1500);
  }

  queueFailedNotification(input);
  return false;
}
