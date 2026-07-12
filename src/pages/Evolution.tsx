/**
 * Evolution.tsx — Painel de evolução do aluno.
 * Tabs: Dashboard (comparativo) · Histórico (timeline).
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import ComparisonBoard from "@/components/student/ComparisonBoard";
import EvolutionTimeline from "@/components/student/EvolutionTimeline";
import { ProgressChart } from "@/components/student/ProgressChart";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus, MessageCircle } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} semana${Math.floor(days / 7) > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function Evolution() {
  const navigate = useNavigate();
  const { anamnesis, checkIns, loading, studentId } = useStudentData();
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth");
    });
  }, [navigate]);

  const { data: latestFeedback } = useQuery({
    queryKey: ["latest-coach-feedback", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await sb
        .from("check_ins")
        .select("id, submitted_at, coach_feedback, feedback_read_at")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; submitted_at: string; coach_feedback: string | null; feedback_read_at: string | null } | null;
    },
  });

  const hasFeedback = !!(latestFeedback?.coach_feedback && latestFeedback.coach_feedback.trim());
  const needsMarkRead = hasFeedback && !latestFeedback?.feedback_read_at;

  useEffect(() => {
    if (!needsMarkRead || !latestFeedback?.id) return;
    let cancelled = false;
    (async () => {
      await sb
        .from("check_ins")
        .update({ feedback_read_at: new Date().toISOString() })
        .eq("id", latestFeedback.id);
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: ["latest-coach-feedback", studentId] });
      }
    })();
    return () => { cancelled = true; };
  }, [needsMarkRead, latestFeedback?.id, studentId, qc]);

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground">Minha Evolução</h1>
            <p className="text-[11px] text-muted-foreground">
              Acompanhe seu progresso e histórico
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {loading || !studentId ? (
          <>
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : (
          <>
          {hasFeedback && latestFeedback && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-500" />
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-500">Feedback do seu coach</p>
                <span className="text-[11px] text-muted-foreground ml-auto">{formatRelative(latestFeedback.submitted_at)}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {latestFeedback.coach_feedback}
              </p>
            </div>
          )}
          <Tabs defaultValue="dashboard" className="space-y-5">
            <TabsList className="grid grid-cols-2 w-full bg-card border border-border">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-4 mt-0">
              <ProgressChart />
              <ComparisonBoard
                anamnesis={anamnesis}
                latestCheckIn={checkIns[0] ?? null}
              />
              <Button className="w-full" onClick={() => navigate("/check-in")}>
                <Plus className="w-4 h-4 mr-2" /> Novo check-in
              </Button>
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <EvolutionTimeline checkIns={checkIns} />
            </TabsContent>
          </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
