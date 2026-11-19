import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Loader2, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCoachBlocked } from "@/lib/coachAccessStatus";

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
        const { data: ana, error: anaErr } = await supabase
          .from("anamnesis")
          .select("submitted_at")
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
        }

        // Vínculo oficial (coach_students ativo) + último status conhecido em
        // caso de falha de rede — ver src/lib/coachAccessStatus.ts.
        const blocked = await fetchCoachBlocked(userId);
        if (!cancelled) setCoachBlocked(blocked);
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

  return <>{children}</>;
};
