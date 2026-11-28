/**
 * usePlanCheckout — pagar um plano pelo Mercado Pago, com o aceite do contrato
 * antes quando ele ainda não foi feito para aquele plano/valor.
 *
 * Usado no card "Meu Plano" e na tela de acesso pausado. O app NUNCA libera o
 * plano aqui: só abre o checkout; quem libera é o webhook confirmado.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContractAccept } from "@/components/legal/ContractAccept";
import {
  fetchKnownSigner, fetchMyCurrentAcceptance, hasAcceptedContract, planKindOf, recordPlanSilently,
  type CatalogPlanLike,
} from "@/lib/serviceContract";

export interface CheckoutPlan {
  slug: string;
  name: string;
  duration_months: number;
  kind?: string | null;
}

interface PendingContract {
  body: Record<string, unknown>;
  key: string;
  plan: CheckoutPlan;
  cents: number;
  known: { cpf: string; guardianName?: string | null } | null;
}

export function usePlanCheckout(userId: string | null | undefined, catalog: CatalogPlanLike[]) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [contractFor, setContractFor] = useState<PendingContract | null>(null);

  const openCheckout = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-create-preference", { body });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || "Não foi possível abrir o checkout");
      qc.invalidateQueries({ queryKey: ["my-plan-charges", userId] });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir o checkout");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Paga `body` (finance_id ou plan_id). Se ainda não aceitou o contrato deste
   * plano/valor, mostra o aceite e depois segue. Se não der para verificar,
   * segue direto — nunca trava o pagamento. Ajuste avulso não pede contrato.
   */
  const pay = async (body: Record<string, unknown>, key: string, plan: CheckoutPlan | null, cents: number) => {
    if (!userId || !plan || !cents || planKindOf(plan) === "one_off") return openCheckout(body, key);
    setBusy(key);
    const ok = await hasAcceptedContract(userId, plan.slug, cents);
    if (ok !== false) { setBusy(null); return openCheckout(body, key); }
    // Já aceitou esta versão no cadastro? Registra o plano sozinho, exceto com
    // desconto de parceria/promoção, que pede uma confirmação rápida.
    const prior = await fetchMyCurrentAcceptance(userId);
    if (prior && await recordPlanSilently({ studentId: userId, prior, plan, finalCents: cents, catalog })) {
      setBusy(null);
      return openCheckout(body, key);
    }
    const known = prior?.cpf ? { cpf: prior.cpf, guardianName: prior.guardian_name } : await fetchKnownSigner(userId);
    setBusy(null);
    setContractFor({ body, key, plan, cents, known });
  };

  const contractDialog = (
    <Dialog open={!!contractFor} onOpenChange={(o) => { if (!o) setContractFor(null); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Antes de pagar</DialogTitle>
          <DialogDescription>
            {contractFor?.known ? "Confira o plano e aceite o contrato." : "Confirme seu CPF e aceite o contrato do plano."}
          </DialogDescription>
        </DialogHeader>
        {contractFor && userId && (
          <ContractAccept
            studentId={userId}
            plan={contractFor.plan}
            finalCents={contractFor.cents}
            catalog={catalog}
            confirmLabel="Aceitar e pagar"
            known={contractFor.known}
            onAccepted={() => { const c = contractFor; setContractFor(null); void openCheckout(c.body, c.key); }}
            onUnavailable={() => { const c = contractFor; setContractFor(null); void openCheckout(c.body, c.key); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  return { busy, pay, contractDialog };
}
