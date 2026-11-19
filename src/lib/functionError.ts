/**
 * Extrai a mensagem real de erro de uma edge function.
 *
 * Quando a function responde com status de erro (4xx/5xx), o supabase-js só
 * diz "Edge Function returned a non-2xx status code" — a explicação que a
 * function mandou (ex.: "a chave do Groq é inválida") fica escondida em
 * `error.context`. Sem isso, o coach via só "não foi possível" e não sabia se
 * o problema era a chave, o limite ou o modelo da IA.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> }
    | undefined;
  if (ctx && (typeof ctx.clone === "function" || typeof ctx.json === "function")) {
    try {
      const body = (typeof ctx.clone === "function" ? await ctx.clone().json() : await ctx.json!()) as
        | { error?: unknown; message?: unknown }
        | null;
      for (const v of [body?.error, body?.message]) {
        if (typeof v === "string" && v.trim() && !isTechnicalCode(v)) return v.trim();
      }
    } catch {
      /* corpo ilegível */
    }
  }
  if (error instanceof Error && error.message && !/non-2xx|failed to send a request|fetch failed/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

/** Códigos curtos tipo "ia_invalida" não servem de mensagem para pessoas. */
function isTechnicalCode(v: string): boolean {
  return /^[a-z0-9_]+$/.test(v.trim());
}
