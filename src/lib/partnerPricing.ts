/**
 * partnerPricing.ts — espelho SOMENTE DE EXIBIÇÃO das regras de preço de parceria.
 *
 * A fonte de verdade é o backend (`supabase/functions/_shared/partnerPricing.ts`).
 * O frontend NUNCA decide desconto nem comissão: só formata o que o backend
 * devolveu, ou mostra uma prévia informativa antes de confirmar.
 */

export type PartnerPlanSlug = "monthly" | "quarterly" | "semiannual";

export interface PartnerPlanPricing {
  slug: PartnerPlanSlug;
  name: string;
  duration_months: number;
  full_price_cents: number;
  plan_discount_bp: number;
  partner_discount_allowed: boolean;
}

export const PARTNER_DISCOUNT_BP = 1000;

export const PARTNER_PLAN_PRICING: Record<PartnerPlanSlug, PartnerPlanPricing> = {
  monthly:    { slug: "monthly",    name: "Mensal",     duration_months: 1, full_price_cents: 35000,  plan_discount_bp: 0,    partner_discount_allowed: false },
  quarterly:  { slug: "quarterly",  name: "Trimestral", duration_months: 3, full_price_cents: 105000, plan_discount_bp: 1500, partner_discount_allowed: true },
  semiannual: { slug: "semiannual", name: "Semestral",  duration_months: 6, full_price_cents: 210000, plan_discount_bp: 1500, partner_discount_allowed: true },
};

export const PARTNER_PLAN_LIST = Object.values(PARTNER_PLAN_PRICING);

export interface PriceBreakdown {
  slug: PartnerPlanSlug;
  full_price_cents: number;
  plan_discount_bp: number;
  partner_discount_bp: number;
  partner_applied: boolean;
  final_price_cents: number;
}

/** Prévia informativa (mesma fórmula do backend, um único arredondamento). */
export function previewFinalPrice(slug: PartnerPlanSlug, partnerAttributed: boolean): PriceBreakdown {
  const plan = PARTNER_PLAN_PRICING[slug];
  const applyPartner = partnerAttributed && plan.partner_discount_allowed;
  const factor =
    ((10000 - plan.plan_discount_bp) / 10000) *
    (applyPartner ? (10000 - PARTNER_DISCOUNT_BP) / 10000 : 1);
  return {
    slug,
    full_price_cents: plan.full_price_cents,
    plan_discount_bp: plan.plan_discount_bp,
    partner_discount_bp: applyPartner ? PARTNER_DISCOUNT_BP : 0,
    partner_applied: applyPartner,
    final_price_cents: Math.round(plan.full_price_cents * factor),
  };
}

/** Prévia da comissão — o valor real é sempre o gravado pelo backend. */
export function previewCommission(finalPriceCents: number, rateBp: number): number {
  return Math.round((finalPriceCents * rateBp) / 10000);
}

export function formatRateBp(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export const SELF_REPORTED_SOURCES = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Google",
  "Indicação de amigo(a)",
  "Influenciador(a)",
  "Outro",
] as const;
