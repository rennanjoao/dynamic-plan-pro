import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Dumbbell, AlertTriangle, Activity, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";

const WEEKDAYS_LABEL: Record<string, string> = {
  seg: "Segunda", ter: "Terça", qua: "Quarta",
  qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo",
};

const TERM_INFO: Record<string, { label: string; desc: string }> = {
  reps: { label: "Repetições", desc: "Quantidade de vezes que executa o movimento em cada série." },
  cadence: { label: "Cadência", desc: "Velocidade de execução. Ex: 3-1-2 = 3s descendo, 1s pausa, 2s subindo." },
  rest: { label: "Descanso", desc: "Tempo de recuperação entre séries. Respeite para manter qualidade." },
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
      const { data } = await supabase.from("coach_plans").select("workout_periodization_json").eq("student_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const rawPayload = planData?.workout_periodization_json || {};
  const parsed = ProtocolPayloadSchema.safeParse(rawPayload);
  const safePayload: any = parsed.success ? parsed.data : rawPayload;
  
  const workouts = Array.isArray(safePayload?.workouts) ? safePayload.workouts : [];
  const trainingGuideline = safePayload?.guidelines?.training;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Plano de Treino</h1>
          <p className="text-xs text-muted-foreground">Biomecânica e Periodização</p>
        </div>
        
      </header>


      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* DIRETRIZES DE TREINO EM EVIDÊNCIA */}
        {trainingGuideline && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl shadow-sm">
            <h3 className="text-amber-600 font-bold flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5" /> Atenção — Diretriz do Treinador
            </h3>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {trainingGuideline}
            </p>
          </div>
        )}

        {workouts.length === 0 ? (
          <p className="text-center text-muted-foreground italic py-10">Treinos ainda não publicados.</p>
        ) : (
          <Accordion type="single" collapsible className="w-full space-y-4">
            {workouts.map((day: any, i: number) => (
              <AccordionItem key={i} value={`workout-${i}`} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-muted/30">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-lg">
                      {day.key}
                    </div>
                    <div>
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
                        {ex.notes && <p className="text-xs text-muted-foreground mt-2 italic bg-muted/30 p-2 rounded border-l-2 border-primary/50">{ex.notes}</p>}
                      </div>
                    ))}
                  </div>
                  
                  {/* BOTÃO DE DÚVIDA DO TREINO */}
                  <ProtocolQuestionButton context="exercise" variant="full" />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Aeróbicos prescritos */}
        {Array.isArray(safePayload?.cardio) && safePayload.cardio.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-sm text-foreground flex items-center gap-2 px-1">
              <Activity className="w-4 h-4 text-primary" /> Aeróbico Prescrito
            </h2>
            {safePayload.cardio.map((c: any, i: number) => (
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
    </div>
  );
}
