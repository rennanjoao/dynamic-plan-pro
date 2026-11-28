/**
 * partnerPricing.ts — formatação ligada a parcerias.
 *
 * Preço e desconto de parceria NÃO ficam mais aqui: a regra única está no
 * banco (`plan_quote`, migração 20261128090000): preço do "Meus Planos" do
 * coach e 10% de parceria só no 1º pagamento de trimestral/semestral.
 */

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
