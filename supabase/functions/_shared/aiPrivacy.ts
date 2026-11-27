// LGPD: o que sai para o fornecedor de IA é só o necessário para o resumo.
// Nunca vão identificadores (nome, e-mail, telefone, cidade), segredos (senha,
// código de acesso), links de fotos/exames nem ids internos. A data de
// nascimento vira só a idade. Sem imports de Deno: é testado pelo vitest.

const BLOCKED_KEYS = new Set([
  "senha", "password", "confirmar_senha",
  "nome", "name", "full_name", "email", "whatsapp", "telefone", "phone", "celular",
  "cidade", "endereco", "cpf", "rg", "instagram",
  "access_code", "coach_id", "student_id", "user_id",
  "fotos", "fotos_postura", "exames", "shape_inspiracao", "photo_urls",
  "guardian_name",
]);

function ageFrom(value: unknown, now: Date): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/) ?? null;
  const br = m ? null : value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : br ? [+br[3], +br[2], +br[1]] : [NaN, NaN, NaN];
  if (!Number.isFinite(y)) return null;
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

function looksLikeLink(v: unknown): boolean {
  return typeof v === "string" && /^(https?:\/\/|data:|blob:)/i.test(v.trim());
}

/** Cópia do payload sem dados pessoais; `data_nasc` vira `idade`. */
export function redactForAI(payload: unknown, now: Date = new Date()): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (BLOCKED_KEYS.has(key)) continue;
    if (key === "data_nasc" || key === "birth_date") {
      const idade = ageFrom(v, now);
      if (idade !== null && out.idade === undefined) out.idade = idade;
      continue;
    }
    if (looksLikeLink(v)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactForAI(v, now);
    } else if (Array.isArray(v)) {
      out[k] = v.filter((x) => !looksLikeLink(x)).map((x) => (x && typeof x === "object" && !Array.isArray(x) ? redactForAI(x, now) : x));
    } else {
      out[k] = v;
    }
  }
  return out;
}
