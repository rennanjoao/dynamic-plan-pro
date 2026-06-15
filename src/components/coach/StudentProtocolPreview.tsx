/**
 * StudentProtocolPreview.tsx
 * Permite ao coach visualizar o protocolo exatamente como o aluno veria,
 * usando os dados atuais do payload (mesmo sem salvar).
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Activity, Dumbbell } from "lucide-react";
import type { ProtocolPayload } from "@/lib/protocolSchema";

interface Props {
  open: boolean;
  onClose: () => void;
  payload: ProtocolPayload;
  studentName?: string;
}

export default function StudentProtocolPreview({ open, onClose, payload, studentName }: Props) {
  const workouts = payload.workouts ?? [];
  const cardioGlobal = (payload.cardio ?? []).filter(
    (c) => !c.workoutKey || c.associationType !== "workout"
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-primary" />
            Visão do Aluno{studentName ? ` — ${studentName}` : ""}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Preview em tempo real. Salve o protocolo para publicar.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-120px)] pr-2">
          <div className="space-y-4">
            {workouts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">
                Nenhum treino configurado ainda.
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full space-y-3">
                {workouts.map((day, i) => {
                  const dayCardio = (payload.cardio ?? []).filter(
                    (c) => c.workoutKey === day.key && c.associationType === "workout"
                  );
                  return (
                    <AccordionItem
                      key={i}
                      value={`workout-${i}`}
                      className="bg-card border border-border rounded-xl overflow-hidden"
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                        <div className="flex items-center gap-3 text-left">
                          <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black">
                            {day.key}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm">Treino {day.key}</h3>
                            <p className="text-xs text-muted-foreground">{day.focus || "Geral"}</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 border-t border-border/40">
                        <div className="space-y-3 mt-3">
                          {day.exercises.map((ex, idx) => (
                            <div
                              key={idx}
                              className="bg-background border border-border/50 rounded-lg p-3"
                            >
                              <h4 className="font-bold text-sm text-primary mb-2">
                                • {ex.name || "Exercício"}
                              </h4>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-muted/50 p-2 rounded text-center">
                                  <p className="text-[10px] text-muted-foreground uppercase">Séries</p>
                                  <p className="font-semibold text-sm">{ex.sets || "-"}</p>
                                </div>
                                <div className="bg-muted/50 p-2 rounded text-center">
                                  <p className="text-[10px] text-muted-foreground uppercase">Reps</p>
                                  <p className="font-semibold text-sm">{ex.reps || "-"}</p>
                                </div>
                                <div className="bg-muted/50 p-2 rounded text-center">
                                  <p className="text-[10px] text-muted-foreground uppercase">Descanso</p>
                                  <p className="font-semibold text-sm">{ex.rest || "-"}</p>
                                </div>
                              </div>
                              {ex.cadence && (
                                <div className="bg-muted/50 p-2 rounded text-center mt-2">
                                  <p className="text-[10px] text-muted-foreground uppercase">Cadência</p>
                                  <p className="font-semibold text-sm">{ex.cadence}</p>
                                </div>
                              )}
                              {ex.notes && (
                                <p className="text-xs text-muted-foreground mt-2 italic bg-muted/30 p-2 rounded border-l-2 border-primary/50">
                                  {ex.notes}
                                </p>
                              )}
                            </div>
                          ))}

                          {dayCardio.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-primary" />
                                Aeróbico deste treino
                              </p>
                              {dayCardio.map((c, ci) => (
                                <div
                                  key={ci}
                                  className="bg-background border border-border/50 rounded-lg p-2"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-xs text-primary">
                                      {c.type || "Aeróbico"}
                                    </span>
                                    {c.duration && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {c.duration}
                                      </Badge>
                                    )}
                                  </div>
                                  {c.intensity && (
                                    <Badge variant="secondary" className="text-[10px] mr-1">
                                      {c.intensity}
                                    </Badge>
                                  )}
                                  {c.notes && (
                                    <p className="text-[11px] text-muted-foreground italic mt-1">
                                      {c.notes}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}

            {cardioGlobal.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5 px-1">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  Aeróbico Prescrito (Geral)
                </p>
                {cardioGlobal.map((c, i) => (
                  <Card key={i} className="bg-card border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-primary">
                        {c.type || "Aeróbico"}
                      </span>
                      {c.duration && (
                        <Badge variant="outline" className="text-xs">
                          {c.duration}
                        </Badge>
                      )}
                    </div>
                    {c.intensity && (
                      <Badge variant="secondary" className="text-xs mr-1">
                        {c.intensity}
                      </Badge>
                    )}
                    {c.notes && (
                      <p className="text-xs text-muted-foreground italic mt-1">{c.notes}</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}