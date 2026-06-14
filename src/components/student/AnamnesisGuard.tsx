import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStudentData } from "@/hooks/useStudentData";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const AnamnesisGuard = ({ children }: { children: React.ReactNode }) => {
  const { anamnesis, loading } = useStudentData();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [coachBlocked, setCoachBlocked] = useState(false);
  const [checkingCoach, setCheckingCoach] = useState(true);

  const isAnamnesisRoute = location.pathname.includes("anamnesis");
  const hasCompletedAnamnesis = !!anamnesis?.submitted_at;

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

  useEffect(() => {
    if (!loading && !hasCompletedAnamnesis && !isAnamnesisRoute) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [hasCompletedAnamnesis, loading, isAnamnesisRoute]);

  const handleLogoutOrHome = async () => {
    await supabase.auth.signOut();
    setIsOpen(false);
    navigate("/");
  };

  if (loading || checkingCoach) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-30" />
      </div>
    );
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

  return (
    <>
      {hasCompletedAnamnesis || isAnamnesisRoute ? children : null}

      <AlertDialog open={isOpen}>
        <AlertDialogContent className="border-primary/30 z-[9000]">
          <AlertDialogHeader>
            <AlertDialogTitle>Ponto de Partida Obrigatório</AlertDialogTitle>
            <AlertDialogDescription>
              Para liberar o seu painel, rotinas e gráficos de evolução, é
              estritamente necessário preencher e enviar sua Anamnese inicial.
              O seu protocolo será montado com base nestes dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleLogoutOrHome}
              className="w-full sm:w-auto"
            >
              Voltar ao Início
            </Button>
            <AlertDialogAction
              onClick={() => navigate("/anamnesis")}
              className="w-full sm:w-auto font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Preencher Anamnese Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
