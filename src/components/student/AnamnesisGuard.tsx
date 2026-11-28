import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Loader2, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { fetchCoachBlocked } from "@/lib/coachAccessStatus";
import { hasCurrentConsent } from "@/lib/consent";
import { isMinor } from "@/lib/age";
import { ConsentGate } from "@/components/legal/ConsentGate";
import { ContractGate, type ContractGateSub } from "@/components/legal/ContractGate";
import { fetchKnownSigner, fetchMyCurrentAcceptance, hasAcceptedContract, recordPlanSilently } from "@/lib/serviceContract";
import { fetchMyAccessStatus, type AccessState } from "@/lib/studentAccess";
import { StudentAccessBlockedScreen } from "@/components/student/StudentAccessBlockedScreen";

const ANA_DONE_KEY = (uid: string) => `anamnesis_done_${uid}`;
function readAnamnesisDone(uid: string): boolean | undefined {
  try {
    const v = localStorage.getItem(ANA_DONE_KEY(uid));
    return v === "1" ? true : v === "0" ? false : undefined;
  } catch { return undefined; }
}
function writeAnamnesisDone(uid: string, done: boolean) {
  try { localStorage.setItem(ANA_DONE_KEY(uid), done ? "1" : "0"); } catch { /* noop */ }
}

export const AnamnesisGuard = ({ children }: { children: React.ReactNode }) => {
  const [coachBlocked, setCoachBlocked] = useState(false);
  const [checkingCoach, setCheckingCoach] = useState(true);
  const [hasAnamnesis, setHasAnamnesis] = useState<boolean | null>(null);
  // Consentimento LGPD: só bloqueia quando o servidor CONFIRMA que falta o aceite
  // (sem internet ou erro, segue como antes).
  const [consentNeeded, setConsentNeeded] = useState<{ userId: string; minor: boolean } | null>(null);
  // Contrato do plano: só bloqueia quando há plano vigente e o servidor CONFIRMA
  // que falta o aceite desta versão/valor.
  const [contractNeeded, setContractNeeded] = useState<{ userId: string; sub: ContractGateSub; known: { cpf: string; guardianName?: string | null } | null } | null>(null);
  // Acesso pausado por atraso (> 7 dias): só quando o servidor CONFIRMA.
  const [accessBlocked, setAccessBlocked] = useState<{ userId: string; state: AccessState } | null>(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (previewAs) {
          // Modo Espelho: a anamnese/bloqueio aqui seriam do usuário LOGADO
          // (o coach), não do aluno-alvo do previewAs — nunca barrar o coach.
          if (!cancelled) { setHasAnamnesis(true); setCoachBlocked(false); }
          return;
        }
        // getSession lê a sessão do aparelho (funciona sem internet);
        // getUser ia ao servidor e falhava offline.
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user?.id;
        if (!userId) {
          if (!cancelled) setCoachBlocked(false);
          return;
        }
        // Verifica se o aluno já submeteu a anamnese
        // `sb` (sem tipos): o seletor de campo JSON deixa o tipo gerado pesado demais.
        const { data: ana, error: anaErr } = await sb
          .from("anamnesis")
          .select("submitted_at, data_nasc:payload->>data_nasc")
          .eq("student_id", userId)
          .maybeSingle();
        if (anaErr) {
          // Sem internet/erro do servidor: NÃO mandar para a anamnese (antes a
          // aluna sem sinal na academia caía no formulário de cadastro).
          // Usa o que este aparelho já sabe; sem histórico, deixa seguir.
          if (!cancelled) setHasAnamnesis(readAnamnesisDone(userId) ?? null);
        } else {
          const done = !!ana?.submitted_at;
          writeAnamnesisDone(userId, done);
          if (!cancelled) setHasAnamnesis(done);
          if (done) {
            const consented = await hasCurrentConsent(userId);
            if (!cancelled && consented === false) {
              const nasc = (ana as { data_nasc?: string | null } | null)?.data_nasc;
              setConsentNeeded({ userId, minor: isMinor(nasc) });
            }
            const { data: sub } = await sb
              .from("student_subscriptions")
              .select("coach_id, plan_slug, plan_name, price_cents, cycle_months")
              .eq("student_id", userId)
              .in("status", ["active", "overdue"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (sub && (sub as ContractGateSub).price_cents > 0) {
              const s = sub as ContractGateSub;
              const accepted = await hasAcceptedContract(userId, s.plan_slug, s.price_cents);
              if (accepted === false) {
                // Aceitou no cadastro: registra o plano sozinho (sem tela), exceto com
                // desconto de parceria/promoção, que pede uma confirmação rápida.
                const prior = await fetchMyCurrentAcceptance(userId);
                let silent = false;
                if (prior) {
                  const { data: cat } = await sb.from("student_plan_catalog")
                    .select("*")
                    .eq("coach_id", s.coach_id).eq("is_active", true);
                  silent = await recordPlanSilently({
                    studentId: userId, prior,
                    plan: { slug: s.plan_slug, name: s.plan_name, duration_months: s.cycle_months },
                    finalCents: s.price_cents, catalog: cat ?? [],
                  });
                }
                if (!cancelled && !silent) {
                  // Texto mudou (versão nova)? Pede um novo aceite sem pedir o CPF de novo.
                  const known = prior?.cpf ? { cpf: prior.cpf, guardianName: prior.guardian_name } : await fetchKnownSigner(userId);
                  if (!cancelled) setContractNeeded({ userId, sub: s, known });
                }
              }
            }
          }
        }

        // Vínculo oficial (coach_students ativo) + último status conhecido em
        // caso de falha de rede — ver src/lib/coachAccessStatus.ts.
        const blocked = await fetchCoachBlocked(userId);
        if (!cancelled) setCoachBlocked(blocked);
        if (!blocked && ana?.submitted_at) {
          const access = await fetchMyAccessStatus();
          if (!cancelled && access?.blocked) setAccessBlocked({ userId, state: access });
        }
      } catch {
        if (!cancelled) setCoachBlocked(false);
      } finally {
        if (!cancelled) setCheckingCoach(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewAs]);

  if (checkingCoach) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-30" />
      </div>
    );
  }

  // Aluno sem anamnese submetida → forçar preenchimento antes de qualquer rota interna.
  if (hasAnamnesis === false && location.pathname !== "/anamnesis") {
    return <Navigate to="/anamnesis" replace />;
  }

  if (consentNeeded && location.pathname !== "/anamnesis") {
    return <ConsentGate userId={consentNeeded.userId} minor={consentNeeded.minor} onDone={() => setConsentNeeded(null)} />;
  }

  if (contractNeeded && location.pathname !== "/anamnesis") {
    return <ContractGate userId={contractNeeded.userId} sub={contractNeeded.sub} known={contractNeeded.known} onDone={() => setContractNeeded(null)} />;
  }

  if (coachBlocked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-6">
        <div className="max-w-md text-center space-y-4 border border-destructive/40 rounded-xl p-8 bg-card">
          <Ban className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Plataforma temporariamente indisponível</h1>
          <p className="text-sm text-muted-foreground">
            Fale com o seu treinador.
          </p>
        </div>
      </div>
    );
  }

  if (accessBlocked && location.pathname !== "/anamnesis") {
    return (
      <StudentAccessBlockedScreen
        userId={accessBlocked.userId}
        state={accessBlocked.state}
        onUnblocked={() => setAccessBlocked(null)}
      />
    );
  }

  return <>{children}</>;
};
