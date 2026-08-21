/**
 * Helpers puros do Mercado Pago (sem APIs do Deno) — reaproveitados pelas Edge
 * Functions e cobertos por testes unitários.
 *
 * Nenhum segredo é logado ou exposto aqui: o access token e o webhook secret
 * são sempre recebidos por parâmetro e usados apenas em memória.
 */

export interface ParsedSignature {
  ts: string | null;
  v1: string | null;
}

/** Lê o header `x-signature` no formato `ts=1700000000,v1=abc...`. */
export function parseXSignature(header: string | null | undefined): ParsedSignature {
  const out: ParsedSignature = { ts: null, v1: null };
  if (!header) return out;
  for (const part of header.split(",")) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey?.trim();
    const value = rest.join("=").trim();
    if (key === "ts") out.ts = value || null;
    if (key === "v1") out.v1 = value || null;
  }
  return out;
}

/** Manifest oficial assinado pelo Mercado Pago. */
export function buildSignatureManifest(params: {
  dataId: string;
  requestId: string | null | undefined;
  ts: string;
}): string {
  const { dataId, requestId, ts } = params;
  let manifest = "";
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação em tempo constante (evita timing attack na assinatura). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

/** Valida a assinatura HMAC do webhook. Falha fechada em qualquer dado ausente. */
export async function verifyWebhookSignature(params: {
  signatureHeader: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string | null | undefined;
}): Promise<boolean> {
  const { signatureHeader, requestId, dataId, secret } = params;
  if (!secret || !dataId) return false;
  const { ts, v1 } = parseXSignature(signatureHeader);
  if (!ts || !v1) return false;
  const manifest = buildSignatureManifest({ dataId, requestId, ts });
  const expected = await hmacSha256Hex(secret, manifest);
  return safeEqual(expected, v1.toLowerCase());
}

/** Converte o valor do pagamento (reais, float da API) para centavos. */
export function toCentsFromAmount(amount: number | string | null | undefined): number | null {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Tolerância de 1 centavo para arredondamento do gateway. */
export function amountsMatch(paidCents: number | null, expectedCents: number): boolean {
  if (paidCents === null) return false;
  return Math.abs(paidCents - expectedCents) <= 1;
}

export type InternalPaymentStatus = "paid" | "pending" | "failed";

/** Só `approved` libera o plano. */
export function mapPaymentStatus(status: string | null | undefined): InternalPaymentStatus {
  switch (status) {
    case "approved":
      return "paid";
    case "pending":
    case "in_process":
    case "authorized":
    case "in_mediation":
      return "pending";
    default:
      return "failed";
  }
}

/** Método interno a partir do payment_type_id do Mercado Pago. */
export function mapPaymentMethod(paymentTypeId: string | null | undefined): string {
  switch (paymentTypeId) {
    case "credit_card":
      return "cartao";
    case "debit_card":
      return "cartao_debito";
    case "ticket":
      return "boleto";
    case "bank_transfer":
    case "account_money":
      return "pix";
    default:
      return "mercadopago";
  }
}

/** Soma meses preservando fim de mês (31/01 + 1 mês = 28/02). */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
