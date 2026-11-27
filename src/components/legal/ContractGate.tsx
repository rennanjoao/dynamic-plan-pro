// Tela única para quem já tem plano e ainda não aceitou o contrato
// (ex.: plano ativado pelo coach por PIX). Depois do aceite, o app segue igual.
import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { sb } from "@/integrations/supabase/untyped";
import { ContractAccept } from "@/components/legal/ContractAccept";
import type { CatalogPlanLike } from "@/lib/serviceContract";

export interface ContractGateSub {
  coach_id: string;
  plan_slug: string;
  plan_name: string;
  price_cents: number;
  cycle_months: number;
}

export function ContractGate({ userId, sub, onDone, known }: {
  userId: string; sub: ContractGateSub; onDone: () => void; known?: { cpf: string; guardianName?: string | null } | null;
}) {
  const [catalog, setCatalog] = useState<CatalogPlanLike[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    sb.from("student_plan_catalog")
      .select("slug, name, price_cents, duration_months")
      .eq("coach_id", sub.coach_id)
      .eq("is_active", true)
      .then(({ data }: { data: CatalogPlanLike[] | null }) => { if (!cancelled) setCatalog(data ?? []); });
    return () => { cancelled = true; };
  }, [sub.coach_id]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <div className="max-w-md w-full space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2 text-center">
          <FileSignature className="w-10 h-10 text-primary mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground">Contrato do seu plano</h1>
          <p className="text-sm text-muted-foreground">{known ? "Confirme o plano e o desconto aplicado. É só uma vez." : "É rapidinho: confirme seu CPF e aceite. Só precisa fazer uma vez."}</p>
        </div>
        {catalog && (
          <ContractAccept
            studentId={userId}
            plan={{ slug: sub.plan_slug, name: sub.plan_name, duration_months: sub.cycle_months }}
            finalCents={sub.price_cents}
            catalog={catalog}
            confirmLabel="Aceitar e continuar"
            onAccepted={onDone}
            onUnavailable={onDone}
            known={known}
          />
        )}
      </div>
    </div>
  );
}
