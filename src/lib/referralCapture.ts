// src/lib/referralCapture.ts
// Captura o código de indicação (?ref=) vindo do QR code do WorkoutShareCard
// e mantém salvo até o novo aluno finalizar o cadastro (Anamnesis.tsx).
//
// Padrão: capture-on-landing (Index.tsx) → consume-on-conversion (Anamnesis.tsx).
// O primeiro link clicado "ganha" a atribuição — não sobrescrevemos um código
// já capturado, para não roubar crédito de quem trouxe a visita originalmente.

const STORAGE_KEY = "epx_referral_ref";
const TTL_DAYS = 30;

interface StoredReferral {
  code: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  capturedAt: number;
}

/** Chamar no mount da landing page (Index.tsx). Não faz nada se não houver ?ref=. */
export function captureReferralFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;

    // Já existe uma indicação capturada — não sobrescreve.
    if (localStorage.getItem(STORAGE_KEY)) return;

    const payload: StoredReferral = {
      code: ref.trim(),
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      capturedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage bloqueado/indisponível — não é crítico, apenas ignora
  }
}

function readValid(): StoredReferral | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReferral;
    const ageDays = (Date.now() - parsed.capturedAt) / (1000 * 60 * 60 * 24);
    if (ageDays > TTL_DAYS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Lê sem apagar — usado para auto-resolver o coach na tela de código (Anamnesis.tsx). */
export function peekStoredReferral(): StoredReferral | null {
  return readValid();
}

/** Lê o código armazenado e APAGA em seguida — usar só no momento da conversão. */
export function consumeStoredReferral(): StoredReferral | null {
  const data = readValid();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  return data;
}

// ─── Coach direto (link /c/:coachId) ─────────────────────────────────────────
// Mesmo padrão do referral: captura na landing do convite e consome no
// cadastro (Anamnesis.tsx), evitando pedir o código do treinador a quem já
// chegou por um link identificado.

const DIRECT_COACH_KEY = "epx_direct_coach";

interface StoredDirectCoach {
  coachId: string;
  coachName: string;
  notificationEmail: string | null;
  capturedAt: number;
}

export function storeDirectCoach(
  coachId: string,
  coachName: string,
  notificationEmail: string | null,
): void {
  try {
    const payload: StoredDirectCoach = {
      coachId,
      coachName: coachName || "Seu Treinador",
      notificationEmail: notificationEmail ?? null,
      capturedAt: Date.now(),
    };
    localStorage.setItem(DIRECT_COACH_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage bloqueado — não é crítico */
  }
}

/** Lê o coach armazenado e APAGA em seguida — usar só no momento da conversão. */
export function consumeStoredDirectCoach(): StoredDirectCoach | null {
  try {
    const raw = localStorage.getItem(DIRECT_COACH_KEY);
    localStorage.removeItem(DIRECT_COACH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDirectCoach;
    const ageDays = (Date.now() - parsed.capturedAt) / (1000 * 60 * 60 * 24);
    if (!parsed.coachId || ageDays > TTL_DAYS) return null;
    return parsed;
  } catch {
    return null;
  }
}
