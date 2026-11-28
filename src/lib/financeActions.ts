/**
 * financeActions.ts — ajudas do Financeiro do coach (valor da cobrança e
 * link de pagamento do Mercado Pago).
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FinanceRecord } from "@/hooks/useCoachFinances";

export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

export function chargeCents(f: Pick<FinanceRecord, "amount" | "amount_cents">): number {
  return f.amount_cents ?? Math.round(Number(f.amount) * 100);
}

/** Gera (ou reaproveita) o link do Mercado Pago e copia. */
export async function copyPaymentLink(finance: Pick<FinanceRecord, "id" | "checkout_url">): Promise<boolean> {
  try {
    let url = finance.checkout_url ?? null;
    if (!url) {
      const { data, error } = await supabase.functions.invoke("mercadopago-create-preference", { body: { finance_id: finance.id } });
      if (error) throw error;
      url = (data?.url as string | undefined) ?? null;
      if (!url) throw new Error((data?.error as string | undefined) || "Não foi possível gerar o link");
    }
    await navigator.clipboard.writeText(url).catch(() => undefined);
    toast.success("Link de pagamento copiado. Envie para o aluno.");
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Erro ao gerar o link");
    return false;
  }
}
