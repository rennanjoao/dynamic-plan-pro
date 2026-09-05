/**
 * Evolution.tsx — Painel de evolução do aluno.
 * Tabs: Dashboard (comparativo) · Histórico (timeline).
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import { useStudentData } from "@/hooks/useStudentData";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import ComparisonBoard from "@/components/student/ComparisonBoard";
import EvolutionTimeline from "@/components/student/EvolutionTimeline";
import { ProgressChart } from "@/components/student/ProgressChart";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, MessageCircle, ChevronRight } from "lucide-react";
import { formatRelativePtBR } from "@/lib/formatDate";
import { queryKeys } from "@/lib/queryKeys";
import PreviewModeBar from "@/components/student/PreviewModeBar";

export default function Evolution() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");
  const { anamnesis, checkIns, goal, loading, studentId } = useStudentData();
  const qc = useQueryClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useAuthUserId({ redirectTo: "/auth" });

  const { data: latestFeedback } = useQuery({
    queryKey: queryKeys.latestCoachFeedback(studentId),
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
        qc.invalidateQueries({ queryKey: queryKeys.latestCoachFeedback(studentId) });
      }
    })();
    return () => { cancelled = true; };
  }, [needsMarkRead, latestFeedback?.id, studentId, qc]);

  return (
    <div className="min-h-screen bg-background pb-10">
      <PreviewModeBar />
      <header className={`bg-background/95 backdrop-blur border-b border-border ${!previewAs ? "sticky top-0 z-20" : ""}`}>
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
            <>
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="w-full text-left rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 hover:bg-emerald-500/15 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-500">Feedback do seu coach</p>
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{formatRelativePtBR(latestFeedback.submitted_at)}</span>
                </div>
                <p className="text-sm text-foreground/80 mt-1 line-clamp-1">
                  {latestFeedback.coach_feedback}
                </p>
                <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-600 dark:text-emerald-500">
                  Toque para ver completo <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                      <MessageCircle className="w-4 h-4" /> Feedback do seu coach
                    </DialogTitle>
                    <p className="text-[11px] text-muted-foreground">{formatRelativePtBR(latestFeedback.submitted_at)}</p>
                  </DialogHeader>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {latestFeedback.coach_feedback}
                  </p>
                </DialogContent>
              </Dialog>
            </>
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
                goal={goal}
              />
              <Button className="w-full" onClick={() => navigate("/check-in")}>
                <Plus className="w-4 h-4 mr-2" /> Novo check-in
              </Button>
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <EvolutionTimeline checkIns={checkIns} goal={goal} />
            </TabsContent>
          </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
