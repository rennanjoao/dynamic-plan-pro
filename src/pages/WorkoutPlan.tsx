import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle, Activity, Info, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";
import WorkoutPeriodizationView from "@/components/student/WorkoutPeriodizationView";
import WorkoutMode from "@/components/student/WorkoutMode";
import WorkoutHistory from "@/components/student/WorkoutHistory";
import { useWakeLock } from "@/hooks/useWakeLock";

const WEEKDAYS_LABEL: Record<string, string> = {
  seg: "Segunda", ter: "Terça", qua: "Quarta",
  qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo",
};

const TERM_INFO: Record<string, { label: string; desc: string }> = {
  reps:    { label: "Repetições", desc: "Quantidade de vezes que executa o movimento em cada série." },
  cadence: { label: "Cadência",   desc: "Velocidade de execução. Ex: 3-1-2 = 3s descendo, 1s pausa, 2s subindo." },
  rest:    { label: "Descanso",   desc: "Tempo de recuperação entre séries. Respeite para manter qualidade." },
};

function InfoPopover({ termKey }: { termKey: keyof typeof TERM_INFO }) {
  const info = TERM_INFO[termKey];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-primary inline-flex" aria-label={info.label}>
          <Info className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-[220px] p-3">
        <p className="text-xs font-bold text-foreground mb-1">{info.label}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{info.desc}</p>
      </PopoverContent>
    </Popover>
  );
}

export default function WorkoutPlan() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [showWorkoutMode, setShowWorkoutMode] = useState(false);
  const [workoutModeDay, setWorkoutModeDay] = useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  useWakeLock();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUserId(data.session.user.id);
      else navigate("/auth");
    });
  }, [navigate]);

  const { data: planData, isLoading } = useQuery({
    queryKey: ["student-workout-json", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_plans")
        .select("workout_periodization_json, coach_id")
        .eq("student_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: coachProfile } = useQuery({
    queryKey: ["coach-profile-name", (planData as any)?.coach_id],
    enabled: !!(planData as any)?.coach_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, team_name")
        .eq("user_id", (planData as any).coach_id)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const rawPayload = planData?.workout_periodization_json || {};
  const parsed = ProtocolPayloadSchema.safeParse(rawPayload);
  const safePayload: any = parsed.success ? parsed.data : rawPayload;
  const workouts = Array.isArray(safePayload?.workouts) ? safePayload.workouts : [];
  const trainingGuideline = safePayload?.guidelines?.training;
  const showGuidelines: boolean = (safePayload as any)?.showGuidelines ?? false;
  const periodizationEnabled: boolean = safePayload?.periodization?.enabled ?? false;

  const handleStartWorkout = (dayKey: string) => {
    setWorkoutModeDay(dayKey);
    setShowWorkoutMode(true);
  };

  // Accordion de treinos — visão simples para o aluno (sem painel de coach)
  const workoutAccordion = workouts.length === 0 ? (
    <p className="text-center text-muted-foreground italic py-10">
      Treinos ainda não publicados.
    </p>
  ) : (
    <Accordion type="single" collapsible className="w-full space-y-4">
      {workouts.map((day: any, i: number) => (
        <AccordionItem
          key={i}
          value={`workout-${i}`}
          className="bg-card border border-border rounded-xl shadow-sm overflow-hidden"
        >
          <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-muted/30">
            <div className="flex items-center gap-3 text-left w-full">
              <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-lg shrink-0">
                {day.key}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base">Treino {day.key}</h3>
                <p className="text-xs text-muted-foreground">{day.focus || "Geral"}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 border-t border-border/40">
            <div className="space-y-4 mt-4">
              {Array.isArray(day.exercises) && day.exercises.map((ex: any, idx: number) => (
                <div key={idx} className="bg-background border border-border/50 rounded-lg p-3">
                  <h4 className="font-bold text-sm text-primary mb-2 flex items-start gap-2">
                    <span className="mt-0.5">•</span> {ex.name}
                  </h4>
                  <div className={`grid gap-2 mb-2 ${ex.cadence ? "grid-cols-4" : "grid-cols-3"}`}>
                    <div className="bg-muted/50 p-2 rounded text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Séries</p>
                      <p className="font-semibold text-sm">{ex.sets || "-"}</p>
                    </div>
                    <div className="bg-muted/50 p-2 rounded text-center">
                      <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                        Reps <InfoPopover termKey="reps" />
                      </p>
                      <p className="font-semibold text-sm">{ex.reps || "-"}</p>
                    </div>
                    {ex.cadence && (
                      <div className="bg-muted/50 p-2 rounded text-center">
                        <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                          Cadência <InfoPopover termKey="cadence" />
                        </p>
                        <p className="font-semibold text-sm">{ex.cadence}</p>
                      </div>
                    )}
                    <div className="bg-muted/50 p-2 rounded text-center">
                      <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                        Descanso <InfoPopover termKey="rest" />
                      </p>
                      <p className="font-semibold text-sm">{ex.rest || "-"}</p>
                    </div>
                  </div>
                  {ex.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic bg-muted/30 p-2 rounded border-l-2 border-primary/50">
                      {ex.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {Array.isArray(safePayload?.cardio) &&
              safePayload.cardio.filter(
                (c: any) => c.workoutKey === day.key && c.associationType === "workout"
              ).length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    Aeróbico prescrito para este treino
                  </h4>
                  {safePayload.cardio
                    .filter((c: any) => c.workoutKey === day.key && c.associationType === "workout")
                    .map((c: any, ci: number) => (
                      <div key={ci} className="bg-background border border-border/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-primary">{c.type || "Aeróbico"}</span>
                          {c.duration && <Badge variant="outline" className="text-xs">{c.duration}</Badge>}
                        </div>
                        {c.intensity && <Badge variant="secondary" className="text-xs mr-1">{c.intensity}</Badge>}
                        {c.notes && <p className="text-xs text-muted-foreground italic mt-1">{c.notes}</p>}
                      </div>
                    ))}
                </div>
              )}
            <div className="mt-3">
              <Button
                size="sm"
                className="w-full gap-2"
                onClick={() => handleStartWorkout(day.key)}
              >
                Iniciar Treino {day.key}
              </Button>
            </div>
            <ProtocolQuestionButton context="exercise" variant="full" />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Plano de Treino</h1>
          <p className="text-xs text-muted-foreground">Biomecânica e Periodização</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="gap-1.5">
          <History className="w-4 h-4" /> Histórico
        </Button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {showGuidelines && trainingGuideline && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl shadow-sm">
            <h3 className="text-amber-600 font-bold flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5" /> Atenção — Diretriz do Treinador
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {trainingGuideline}
            </p>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl shadow-sm">
          <h3 className="text-blue-600 font-bold flex items-center gap-2 mb-2 text-sm">
            <AlertTriangle className="w-4 h-4" /> O que fazer se precisar faltar ao treino?
          </h3>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Marque o dia como <strong>descanso</strong> no seu calendário e empurre o treino que faltou para o
            dia seguinte — a dieta continua normalmente junto com o treino reprogramado.{" "}
            <strong>Nunca pule sem reprogramar.</strong> Consistência ao longo das semanas é o que gera resultado.
          </p>
        </div>

        {/* Se periodização ativa → usa WorkoutPeriodizationView (sem allowEdit) */}
        {/* Se periodização inativa → renderiza accordion diretamente, sem painel de coach */}
        {periodizationEnabled ? (
          <WorkoutPeriodizationView
            workouts={workouts as any}
            periodization={safePayload?.periodization}
            onStartWorkout={handleStartWorkout}
            showGuidelines={showGuidelines}
            allowEdit={false}
            renderLegacy={() => workoutAccordion}
          />
        ) : (
          workoutAccordion
        )}

        {/* Aeróbicos não vinculados a treino */}
        {Array.isArray(safePayload?.cardio) &&
          safePayload.cardio.filter((c: any) => !(c.workoutKey && c.associationType === "workout")).length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2 px-1">
                <Activity className="w-4 h-4 text-primary" /> Aeróbico Prescrito
              </h2>
              {safePayload.cardio
                .filter((c: any) => !(c.workoutKey && c.associationType === "workout"))
                .map((c: any, i: number) => (
                  <Card key={i} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-primary">{c.type || "Aeróbico"}</span>
                      {c.duration && <Badge variant="outline" className="text-xs">{c.duration}</Badge>}
                    </div>
                    <div className="flex gap-2 flex-wrap mb-2">
                      {c.intensity && <Badge variant="secondary" className="text-xs">{c.intensity}</Badge>}
                      {c.workoutKey && (
                        <Badge variant="outline" className="text-xs">
                          {c.associationType === "workout"
                            ? `Treino ${c.workoutKey}`
                            : WEEKDAYS_LABEL[c.workoutKey] ?? c.workoutKey}
                        </Badge>
                      )}
                    </div>
                    {c.notes && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
                  </Card>
                ))}
            </div>
          )}
      </main>

      {showWorkoutMode && (
        <WorkoutMode
          workouts={workouts as any}
          userId={userId}
          coachId={(planData as any)?.coach_id ?? undefined}
          coachName={(coachProfile as any)?.full_name ?? undefined}
          teamName={(coachProfile as any)?.team_name ?? undefined}
          initialDay={workoutModeDay}
          periodization={safePayload?.periodization}
          onClose={() => { setShowWorkoutMode(false); setWorkoutModeDay(undefined); }}
        />
      )}

      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Histórico de Treinos</SheetTitle>
          </SheetHeader>
          <WorkoutHistory userId={userId} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
