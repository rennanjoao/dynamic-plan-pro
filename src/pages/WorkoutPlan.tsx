import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Activity, Info, History, CalendarClock, StretchHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProtocolPayloadSchema, isMobilityExercise } from "@/lib/protocolSchema";
import { ExerciseNameButton } from "@/components/shared/ExerciseNameButton";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";
import WorkoutPeriodizationView from "@/components/student/WorkoutPeriodizationView";
import WorkoutMode from "@/components/student/WorkoutMode";
import WorkoutHistory from "@/components/student/WorkoutHistory";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useHighlightTarget } from "@/hooks/useHighlightTarget";
import { slug } from "@/lib/slug";
import WorkoutStrategyHeader from "@/components/student/WorkoutStrategyHeader";
import { MobilityExerciseRow } from "@/components/student/MobilityExerciseRow";
import { MobilitySuggestedDrawer } from "@/components/student/MobilitySuggestedDrawer";
import { useCurrentPeriodizationWeek } from "@/hooks/useCurrentPeriodizationWeek";
import { DEFAULT_WEEKS } from "@/lib/periodizationDefaults";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { PageLoader } from "@/components/ui/PageLoader";
import PreviewModeBar from "@/components/student/PreviewModeBar";
import { isSessionStale } from "@/hooks/useWorkoutSession";


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

const WORKOUT_MODE_UI_KEY = (uid: string) => `workout_mode_ui_${uid}`;

/**
 * Bloco embutido, logo acima dos exercícios de força: "Mobilidade pré-treino".
 * Fechado por padrão; ao abrir, mostra cada exercício com o gif de execução.
 * `MobilityExerciseRow` agora vive em seu próprio arquivo (compartilhado com
 * o MobilitySuggestedDrawer acionado pelo header — ver import acima).
 */
function MobilityBlock({ exercises }: { exercises: any[] }) {
  const mobility = exercises.filter((ex) => isMobilityExercise(ex));
  if (mobility.length === 0) return null;
  return (
    <Accordion type="single" collapsible className="mt-2">
      <AccordionItem value="mobility" className="border-0">
        <AccordionTrigger className="py-2 hover:no-underline">
          <span className="flex items-center gap-2 text-sm font-bold text-primary">
            <StretchHorizontal className="w-4 h-4" />
            Mobilidade pré-treino
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{mobility.length}</Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-2 space-y-2">
          {mobility.map((ex: any, i: number) => (
            <MobilityExerciseRow key={i} ex={ex} />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}


export default function WorkoutPlan() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");
  const draftPreview = searchParams.get("draftPreview") === "1";
  const userId = useAuthUserId({ redirectTo: "/auth" });
  const [showWorkoutMode, setShowWorkoutMode] = useState(false);
  const [workoutModeDay, setWorkoutModeDay] = useState<string | undefined>(undefined);
  const [workoutModeWeek, setWorkoutModeWeek] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);
  // Drawer de "Mobilidade sugerida" aberto pelo link no header (WorkoutStrategyHeader).
  const [mobilityDrawerOpen, setMobilityDrawerOpen] = useState(false);
  const [mobilityDrawerExercises, setMobilityDrawerExercises] = useState<any[]>([]);
  const queryClient = useQueryClient();
  useWakeLock(showWorkoutMode);
  useHighlightTarget();

  // Entrada em 1 toque a partir da Home: /workout-plan?start=<dayKey>
  useEffect(() => {
    const startKey = searchParams.get("start");
    if (!startKey) return;
    setWorkoutModeDay(startKey);
    setShowWorkoutMode(true);
    const next = new URLSearchParams(searchParams);
    next.delete("start");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Resiliência ao Reload (F5): restaura o Modo Treino aberto ──────────────
  // Sem isto, recarregar a página durante um treino em curso derruba o aluno
  // de volta para a lista de planos sem nenhum aviso (estado só existia em
  // memória volátil). Roda uma única vez, assim que o userId é conhecido.
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(WORKOUT_MODE_UI_KEY(userId));
      if (!raw) return;
      const saved = JSON.parse(raw);
      // Só restaura se o registro for recente. Sem esse limite, o Modo Treino
      // reabria sozinho dias depois de um treino abandonado, pulando a tela
      // inicial e dando a impressão de treino em andamento.
      const fresh = !isSessionStale(saved?.savedAt);
      if (saved?.showWorkoutMode && fresh) {
        setShowWorkoutMode(true);
        setWorkoutModeDay(saved.workoutModeDay ?? undefined);
        setWorkoutModeWeek(saved.workoutModeWeek ?? 0);
      } else if (!fresh) {
        localStorage.removeItem(WORKOUT_MODE_UI_KEY(userId));
      }
    } catch { /* rascunho corrompido — ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Persiste o estado do Modo Treino a cada mudança, e limpa quando é fechado
  // (via onClose ou finalização) — mantém a UI e o localStorage sempre em sincronia.
  useEffect(() => {
    if (!userId) return;
    try {
      if (showWorkoutMode) {
        localStorage.setItem(
          WORKOUT_MODE_UI_KEY(userId),
          JSON.stringify({ showWorkoutMode, workoutModeDay, workoutModeWeek, savedAt: Date.now() })
        );
      } else {
        localStorage.removeItem(WORKOUT_MODE_UI_KEY(userId));
      }
    } catch { /* quota etc. */ }
  }, [userId, showWorkoutMode, workoutModeDay, workoutModeWeek]);

  const { data: planData, isLoading } = useQuery({
    queryKey: ["student-workout-json", userId, draftPreview],
    enabled: !!userId,
    queryFn: async () => {
      // 1) Fonte primária: protocols (gravação que o coach sempre garante que
      //    aconteceu — a réplica em coach_plans é "best effort" e pode falhar).
      const { data: protocol } = await supabase
        .from("protocols")
        .select("payload, draft_payload, coach_id")
        .eq("student_id", userId)
        .eq("is_template", false)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const effective =
        draftPreview && protocol?.draft_payload && Object.keys(protocol.draft_payload as object).length > 0
          ? protocol.draft_payload
          : protocol?.payload;
      if (effective && Object.keys(effective as object).length > 0) {
        return {
          workout_periodization_json: effective,
          coach_id: protocol?.coach_id,
        };
      }

      // 2) Fallback: coach_plans (cópia legada, só se não houver protocolo ativo)
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

  // [FIX] Sem isto, se o coach publicar um protocolo novo enquanto o aluno já
  // está com esta tela aberta, ela não atualiza sozinha.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`workout-plan-live-${userId}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "protocols", filter: `student_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ["student-workout-json", userId] })
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "coach_plans", filter: `student_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ["student-workout-json", userId] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

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

  // Nome do próprio aluno (para o WorkoutShareCard). Sem isto, o card de
  // compartilhamento cai para o rótulo genérico "Membro Elite Prime Hub".
  const { data: studentProfile } = useQuery({
    queryKey: ["student-profile-name", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const rawPayload = planData?.workout_periodization_json || {};
  const parsed = ProtocolPayloadSchema.safeParse(rawPayload);
  const safePayload: any = parsed.success ? parsed.data : rawPayload;
  const workouts = Array.isArray(safePayload?.workouts) ? safePayload.workouts : [];
  const trainingGuideline = safePayload?.guidelines?.training;
  const showGuidelines: boolean = (safePayload as any)?.showGuidelines ?? false;
  const periodizationEnabled: boolean = safePayload?.periodization?.enabled ?? false;
  const workoutKeys = workouts.map((w: any) => w.key);
  const weeks =
    safePayload?.periodization?.weeks?.length === 4
      ? safePayload.periodization.weeks
      : DEFAULT_WEEKS;
  const { data: currentWeekRaw } = useCurrentPeriodizationWeek(
    userId,
    periodizationEnabled,
    weeks.length,
    workoutKeys
  );
  const currentWeek = currentWeekRaw ?? 0;

  // Treino de hoje (a partir do weekDays do protocolo) — abre por padrão e recebe badge.
  const WEEKDAY_ORDER = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const todayWorkoutKey: string | null = (() => {
    const weekDays = (safePayload?.weekDays as Record<string, string>) || {};
    const k = weekDays[WEEKDAY_ORDER[new Date().getDay()]];
    return k && k !== "REST" ? k : null;
  })();
  const todayIndex = todayWorkoutKey
    ? workouts.findIndex((w: any) => String(w.key) === todayWorkoutKey)
    : -1;

  if (isLoading) return <PageLoader />;


  const handleStartWorkout = (dayKey: string, week?: number) => {
    setWorkoutModeDay(dayKey);
    if (week !== undefined) setWorkoutModeWeek(week);
    setShowWorkoutMode(true);
  };

  // Accordion de treinos — visão simples para o aluno (sem painel de coach)
  const workoutAccordion = workouts.length === 0 ? (
    <p className="text-center text-muted-foreground italic py-10">
      Treinos ainda não publicados.
    </p>
  ) : (
    <Accordion
      type="single"
      collapsible
      className="w-full space-y-4"
      defaultValue={todayIndex >= 0 ? `workout-${todayIndex}` : undefined}
    >
      {workouts.map((day: any, i: number) => {
        // [FIX Tarefa 9] Letra exibida = posição no array (A, B, C, D…).
        // day.key permanece como identificador estável — usado em
        // handleStartWorkout, filtros de cardio e ID de âncora — para
        // não quebrar workout_sessions/periodização/CoachUpdates anchors.
        const letter = String.fromCharCode(65 + i);
        const isToday = i === todayIndex;
        return (
        <AccordionItem
          key={i}
          value={`workout-${i}`}
          className={`bg-card border rounded-xl shadow-sm overflow-hidden ${isToday ? "border-primary/60 ring-1 ring-primary/30" : "border-border"}`}
        >
          <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-muted/30">
            <div className="flex items-center gap-3 text-left flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-lg shrink-0">
                {letter}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base flex items-center gap-2">
                  Treino {letter}
                  {isToday && (
                    <Badge className="text-[10px] px-1.5 py-0 h-4">Hoje</Badge>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">{day.focus || "Geral"}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 border-t border-border/40">
            <MobilityBlock exercises={Array.isArray(day.exercises) ? day.exercises : []} />
            <div className="space-y-4 mt-4">
              {Array.isArray(day.exercises) && day.exercises.filter((ex: any) => !isMobilityExercise(ex)).map((ex: any, idx: number) => (
                <div
                  key={idx}
                  id={`workout-${day.key}-exercise-${slug(ex.name)}`}
                  className="bg-background border border-border/50 rounded-lg p-3"
                >
                  <h4 className="font-bold text-sm text-primary mb-2 flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    <ExerciseNameButton name={ex.name} gifKey={ex.gifKey} withThumb />
                  </h4>

                  {(() => {
                    // Com periodização ativa, os blocos refletem a semana
                    // vigente (o aluno perde a barra de topo ao rolar a tela).
                    const wm = periodizationEnabled ? weeks[currentWeek] : null;
                    const vSets = wm?.sets || ex.sets;
                    const vReps = wm?.reps || ex.reps;
                    const vCadence = wm?.cadence || ex.cadence;
                    const vRest = wm?.rest || ex.rest;
                    return (
                      <>
                        {wm && (
                          <p className="text-[10px] font-bold uppercase tracking-wide text-primary/80 mb-1">
                            Semana {currentWeek + 1} de {weeks.length}
                          </p>
                        )}
                        <div className={`grid gap-2 mb-2 ${vCadence ? "grid-cols-4" : "grid-cols-3"}`}>
                          <div className="bg-muted/50 p-2 rounded text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Séries</p>
                            <p className="font-semibold text-sm">{vSets || "-"}</p>
                          </div>
                          <div className="bg-muted/50 p-2 rounded text-center">
                            <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                              Reps <InfoPopover termKey="reps" />
                            </p>
                            <p className="font-semibold text-sm">{vReps || "-"}</p>
                          </div>
                          {vCadence && (
                            <div className="bg-muted/50 p-2 rounded text-center">
                              <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                                Cadência <InfoPopover termKey="cadence" />
                              </p>
                              <p className="font-semibold text-sm">{vCadence}</p>
                            </div>
                          )}
                          <div className="bg-muted/50 p-2 rounded text-center">
                            <p className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                              Descanso <InfoPopover termKey="rest" />
                            </p>
                            <p className="font-semibold text-sm">{vRest || "-"}</p>
                          </div>
                        </div>
                      </>
                    );
                  })()}

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
                Iniciar Treino {letter}
              </Button>
            </div>
            <ProtocolQuestionButton context="exercise" variant="full" />
          </AccordionContent>
        </AccordionItem>
        );
      })}
    </Accordion>
  );

  return (
    <div className="min-h-screen bg-background">
      <PreviewModeBar />
      <header className={`bg-background border-b px-4 py-3 flex items-center gap-3 shadow-sm ${!previewAs ? "sticky top-0 z-40" : ""}`}>
        <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Plano de Treino</h1>
          <p className="text-xs text-muted-foreground">Biomecânica e Periodização</p>
        </div>
        <PreviousProtocolButton studentId={userId} kind="treino" />
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="gap-1.5">
          <History className="w-4 h-4" /> Histórico
        </Button>

      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        <WorkoutStrategyHeader
          payload={safePayload}
          studentName={(studentProfile as any)?.full_name ?? undefined}
          periodizationEnabled={periodizationEnabled}
          weeks={weeks}
          currentWeek={currentWeek}
          onOpenMobility={(exercises) => {
            setMobilityDrawerExercises(exercises);
            setMobilityDrawerOpen(true);
          }}
        />

        {showGuidelines && trainingGuideline && (
          <div
            id="guideline-training"
            className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl shadow-sm"
          >
            <h3 className="text-amber-600 font-bold flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5" /> Atenção — Diretriz do Treinador
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {trainingGuideline}
            </p>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-blue-600 font-bold text-sm leading-tight">
                O que fazer se precisar faltar ao treino?
              </h3>
              <ol className="mt-3 space-y-2">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span className="text-sm text-foreground/90 leading-snug">
                    Marque o dia como <strong>descanso</strong> no seu calendário.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-600 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span className="text-sm text-foreground/90 leading-snug">
                    Empurre o treino que faltou para o dia seguinte{" "}
                    <span className="text-foreground/70">(a dieta continua normal)</span>.
                  </span>
                </li>
              </ol>
              <p className="mt-3 text-xs italic text-blue-700/90 dark:text-blue-300/90 leading-snug">
                <strong className="not-italic">Nunca pule sem reprogramar.</strong> Consistência ao longo das semanas é o que gera resultado.
              </p>
            </div>
          </div>
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
            initialWeek={currentWeek}
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

      {showWorkoutMode && workouts.length > 0 && (
        <WorkoutMode
          workouts={workouts as any}
          userId={userId}
          coachId={(planData as any)?.coach_id ?? undefined}
          coachName={(coachProfile as any)?.full_name ?? undefined}
          teamName={(coachProfile as any)?.team_name ?? undefined}
          studentName={(studentProfile as any)?.full_name ?? undefined}
          initialDay={workoutModeDay}
          initialWeek={workoutModeWeek}
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

      {/* Modal/Drawer "Mobilidade sugerida" — aberto pelo link sutil no
          header do card de treino (WorkoutStrategyHeader). Mostra APENAS os
          exercícios de mobilidade do treino de hoje (já filtrados pelo
          header ao montar `mobilityDrawerExercises`); a lista de exercícios
          do treino principal, logo acima, já exclui esses itens — sem
          duplicação. Drawer no mobile / Dialog no desktop, mesmo padrão de
          ExerciseVideoSheet.tsx usado em WorkoutMode.tsx. */}
      <MobilitySuggestedDrawer
        open={mobilityDrawerOpen}
        onOpenChange={setMobilityDrawerOpen}
        exercises={mobilityDrawerExercises}
      />
    </div>
  );
}
