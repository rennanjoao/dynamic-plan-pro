/**
 * studentPlans.ts — catálogo comercial dos planos dos ALUNOS.
 *
 * Regras:
 * - Preço sempre em CENTAVOS (inteiro). Nunca calcular dinheiro em float.
 * - Formatação em BRL acontece só na interface.
 * - Este domínio é dos alunos. NÃO se mistura com `platform_billing_charges`
 *   (assinatura da plataforma cobrada do coach) nem com `app_settings.coach_plans`.
 * - Cada coach pode ter seus próprios planos (`coach_id`). Linhas com
 *   `coach_id: null` são planos padrão/legado, compartilhados como fallback
 *   pra quem ainda não cadastrou um plano próprio.
 */

export type StudentPlanSlug = "monthly" | "quarterly" | "semiannual" | string;

export interface StudentPlan {
  id: string;
  coach_id: string | null;
  slug: StudentPlanSlug;
  name: string;
  price_cents: number;
  duration_months: number;
  description?: string | null;
  benefits: string[];
  is_active: boolean;
  sort_order: number;
}

/** Fallback usado se o catálogo do banco estiver indisponível. */
export const DEFAULT_STUDENT_PLANS: StudentPlan[] = [
  {
    id: "default-monthly",
    coach_id: null,
    slug: "monthly",
    name: "Mensal",
    price_cents: 35000,
    duration_months: 1,
    description: "Acompanhamento completo com renovação mensal.",
    benefits: ["Protocolo personalizado", "Check-ins periódicos", "Ajustes de treino e dieta"],
    is_active: true,
    sort_order: 1,
  },
  {
    id: "default-quarterly",
    coach_id: null,
    slug: "quarterly",
    name: "Trimestral",
    price_cents: 75000,
    duration_months: 3,
    description: "Três meses de acompanhamento com melhor custo-benefício.",
    benefits: ["Tudo do plano Mensal", "Periodização de 3 meses", "Prioridade no suporte"],
    is_active: true,
    sort_order: 2,
  },
  {
    id: "default-semiannual",
    coach_id: null,
    slug: "semiannual",
    name: "Semestral",
    price_cents: 140000,
    duration_months: 6,
    description: "Seis meses de acompanhamento contínuo.",
    benefits: ["Tudo do plano Trimestral", "Periodização de 6 meses", "Melhor valor por mês"],
    is_active: true,
    sort_order: 3,
  },
];

/** Converte reais (número ou string "1.400,00") para centavos com arredondamento seguro. */
export function toCents(value: number | string): number {
  if (typeof value === "number") return Math.round(value * 100);
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Centavos -> reais (para gravar em coach_finances.amount, que é numeric). */
export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatCents(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Soma meses preservando o fim de mês (31/01 + 1 mês = 28/02). */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function nextDueDate(startISO: string, cycleMonths: number): string {
  return addMonths(startISO, cycleMonths);
}

/**
 * Métodos de pagamento realmente confirmados pela InfinityPay no Checkout
 * Integrado (Pix e cartão de crédito). Boleto e "PIX parcelado" ficam ocultos
 * até que exista confirmação técnica na documentação/conta.
 */
export const SUPPORTED_GATEWAY_METHODS = ["pix", "credit_card"] as const;
export const MAX_CARD_INSTALLMENTS = 12;

export function isGatewayMethodSupported(method: string): boolean {
  return (SUPPORTED_GATEWAY_METHODS as readonly string[]).includes(method);
}
