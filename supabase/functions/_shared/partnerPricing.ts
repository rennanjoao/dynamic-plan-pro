// Preços e descontos do programa de parcerias.
// TUDO em centavos inteiros. Um único arredondamento no final.
// Espelhado (somente leitura/exibição) em src/lib/partnerPricing.ts.

export type PartnerPlanSlug = "monthly" | "quarterly" | "semiannual";

export interface PartnerPlanPricing {
  slug: PartnerPlanSlug;
  name: string;
  duration_months: number;
  full_price_cents: number;
  /** desconto do plano em basis points (1500 = 15%) */
  plan_discount_bp: number;
  /** o plano aceita desconto adicional de parceria? */
  partner_discount_allowed: boolean;
}

/** Desconto adicional quando o aluno veio de uma influenciadora (10%). */
export const PARTNER_DISCOUNT_BP = 1000;

export const PARTNER_PLAN_PRICING: Record<PartnerPlanSlug, PartnerPlanPricing> = {
  monthly: {
    slug: "monthly",
    name: "Mensal",
    duration_months: 1,
    full_price_cents: 35000,
    plan_discount_bp: 0,
    partner_discount_allowed: false,
  },
  quarterly: {
    slug: "quarterly",
    name: "Trimestral",
    duration_months: 3,
    full_price_cents: 105000,
    plan_discount_bp: 1500,
    partner_discount_allowed: true,
  },
  semiannual: {
    slug: "semiannual",
    name: "Semestral",
    duration_months: 6,
    full_price_cents: 210000,
    plan_discount_bp: 1500,
    partner_discount_allowed: true,
  },
};

export function isPartnerPlanSlug(v: unknown): v is PartnerPlanSlug {
  return typeof v === "string" && v in PARTNER_PLAN_PRICING;
}

export interface PriceBreakdown {
  slug: PartnerPlanSlug;
  full_price_cents: number;
  plan_discount_bp: number;
  partner_discount_bp: number;
  partner_applied: boolean;
  final_price_cents: number;
}

/**
 * final = round(full * (1 - planDiscount) * (partner ? (1 - partnerDiscount) : 1))
 * Sem arredondamento intermediário.
 */
export function computeFinalPrice(
  slug: PartnerPlanSlug,
  partnerAttributed: boolean,
): PriceBreakdown {
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

/** commission = round(final * rate_bp / 10000) */
export function computeCommission(finalPriceCents: number, rateBp: number): number {
  return Math.round((finalPriceCents * rateBp) / 10000);
}
