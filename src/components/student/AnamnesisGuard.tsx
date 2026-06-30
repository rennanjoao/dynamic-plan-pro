import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const AnamnesisGuard = ({ children }: { children: React.ReactNode }) => {
  const [coachBlocked, setCoachBlocked] = useState(false);
  const [checkingCoach, setCheckingCoach] = useState(true);
  const [hasAnamnesis, setHasAnamnesis] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) {
          if (!cancelled) setCoachBlocked(false);
          return;
        }
        // Verifica se o aluno já submeteu a anamnese
        const { data: ana } = await supabase
          .from("anamnesis")
          .select("submitted_at")
          .eq("student_id", userId)
          .maybeSingle();
        if (!cancelled) setHasAnamnesis(!!ana?.submitted_at);

        const { data: plan } = await supabase
          .from("coach_plans")
          .select("coach_id, updated_at")
          .eq("student_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const coachId = plan?.coach_id;
        if (!coachId) {
          if (!cancelled) setCoachBlocked(false);
          return;
        }
        const { data: coach } = await supabase
          .from("profiles")
          .select("blocked_until")
          .eq("user_id", coachId)
          .maybeSingle();
        const blocked =
          !!coach?.blocked_until && new Date(coach.blocked_until) > new Date();
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
  }, []);

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
            Entre em contato com seu coach.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
