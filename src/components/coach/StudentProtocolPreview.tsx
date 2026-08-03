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
import { Activity, Dumbbell, UtensilsCrossed, FileText, BarChart3, Calendar } from "lucide-react";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import { WEEKDAYS } from "@/lib/protocolSchema";
import { Private } from "@/components/coach/PrivacyMode";

export type PreviewSection = "macros" | "guidelines" | "workouts" | "diet" | "cycle";

interface Props {
  open: boolean;
  onClose: () => void;
  payload: ProtocolPayload;
  studentName?: string;
  section?: PreviewSection;
}

const SECTION_META: Record<PreviewSection, { title: string; Icon: typeof Dumbbell }> = {
  macros: { title: "Macros", Icon: BarChart3 },
  guidelines: { title: "Diretrizes", Icon: FileText },
  workouts: { title: "Treino", Icon: Dumbbell },
  diet: { title: "Dieta", Icon: UtensilsCrossed },
  cycle: { title: "Semana", Icon: Calendar },
};

export default function StudentProtocolPreview({ open, onClose, payload, studentName, section = "workouts" }: Props) {
  const workouts = payload.workouts ?? [];
  const cardioGlobal = (payload.cardio ?? []).filter(
    (c) => !c.workoutKey || c.associationType !== "workout"
  );
  const meta = SECTION_META[section];
  const HeaderIcon = meta.Icon;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HeaderIcon className="w-5 h-5 text-primary" />
            Visão do Aluno — {meta.title}
            {studentName ? <> · <Private>{studentName}</Private></> : null}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Preview em tempo real. Salve o protocolo para publicar.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-120px)] pr-2">
          <div className="space-y-4">
            {section === "macros" && <MacrosPreview payload={payload} />}
            {section === "guidelines" && <GuidelinesPreview payload={payload} />}
            {section === "diet" && <DietPreview payload={payload} />}
            {section === "cycle" && <CyclePreview payload={payload} />}
            {section === "workouts" && (
              <>
            {workouts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-8">
                Nenhum treino configurado ainda.
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full space-y-3">
                {workouts.map((day, i) => {
                  // [FIX Tarefa 9] Letra exibida = posição no array (A, B, C, D…).
                  // day.key permanece como identificador estável para associar cardio.
                  const letter = String.fromCharCode(65 + i);
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
                            {letter}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm">Treino {letter}</h3>
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
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Macros ──────────────────────────────────────────────────────────────────
function MacrosPreview({ payload }: { payload: ProtocolPayload }) {
  const m = payload.macros;
  const items: Array<[string, string | number, string]> = [
    ["Calorias", m.calories, "kcal"],
    ["Proteína", m.protein, "g"],
    ["Carboidrato", m.carbs, "g"],
    ["Gordura", m.fat, "g"],
    ["Água", m.water, "L"],
  ];
  return (
    <div className="space-y-3">
      <Card className="bg-card border border-border p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Objetivo</p>
        <p className="font-bold text-base text-primary capitalize">{m.goal || "—"}</p>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([label, val, unit]) => (
          <Card key={label} className="bg-card border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-bold text-lg text-foreground">
              {val} <span className="text-xs text-muted-foreground font-normal">{unit}</span>
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Guidelines ──────────────────────────────────────────────────────────────
function GuidelinesPreview({ payload }: { payload: ProtocolPayload }) {
  const g = payload.guidelines;
  const blocks: Array<[string, string]> = [
    ["Treino", g?.training || ""],
    ["Dieta", g?.diet || ""],
    ["Organização da Semana", g?.weekOrganization || ""],
    ["Suplementação", g?.supplementation || ""],
  ];
  const hasAny = blocks.some(([, v]) => v.trim());
  if (!hasAny) {
    return (
      <p className="text-sm text-muted-foreground italic text-center py-8">
        Nenhuma diretriz preenchida.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {blocks.map(([label, val]) =>
        val.trim() ? (
          <Card key={label} className="bg-card border border-border p-4">
            <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1.5">{label}</p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{val}</p>
          </Card>
        ) : null
      )}
    </div>
  );
}

// ─── Diet ────────────────────────────────────────────────────────────────────
function DietPreview({ payload }: { payload: ProtocolPayload }) {
  const meals = payload.meals ?? [];
  if (meals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic text-center py-8">
        Nenhuma refeição configurada ainda.
      </p>
    );
  }
  const KIND_LABEL: Record<string, string> = { carb: "Carboidrato", protein: "Proteína", fat: "Gordura" };
  return (
    <Accordion type="single" collapsible className="w-full space-y-3">
      {meals.map((meal, i) => {
        const hidden = meal.hiddenKinds ?? [];
        const visibleOpts = (meal.options ?? []).filter((o) => !hidden.includes(o.kind));
        const grouped = (["carb", "protein", "fat"] as const).map((k) => ({
          kind: k,
          opts: visibleOpts.filter((o) => o.kind === k),
        }));
        return (
          <AccordionItem
            key={i}
            value={`meal-${i}`}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">{meal.name || `Refeição ${i + 1}`}</h3>
                  {meal.time && <p className="text-xs text-muted-foreground">{meal.time}</p>}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 border-t border-border/40">
              <div className="space-y-3 mt-3">
                {grouped.map(({ kind, opts }) =>
                  opts.length === 0 ? null : (
                    <div key={kind} className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-primary">
                        {KIND_LABEL[kind]}
                      </p>
                      {opts.map((opt, oi) => (
                        <div
                          key={oi}
                          className="bg-background border border-border/50 rounded-lg p-2.5"
                        >
                          {opt.title && (
                            <p className="text-[11px] text-muted-foreground mb-1">{opt.title}</p>
                          )}
                          <ul className="space-y-0.5">
                            {(opt.items ?? []).filter((it) => it.name?.trim()).map((it, ii) => (
                              <li key={ii} className="text-sm text-foreground flex justify-between gap-2">
                                <span>{it.name}</span>
                                {it.weight && (
                                  <span className="text-xs text-muted-foreground">{it.weight}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )
                )}
                {meal.notes && (
                  <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded border-l-2 border-primary/50">
                    {meal.notes}
                  </p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

// ─── Cycle (Semana) ──────────────────────────────────────────────────────────
function CyclePreview({ payload }: { payload: ProtocolPayload }) {
  const cycleEnabled = payload.setup?.carbCycle;
  const cc = payload.carbCycle ?? {};
  const notes = payload.carbCycleNotes ?? {};
  const dayLabel = (v: string) => {
    if (v === "high") return { txt: "Alto", cls: "bg-emerald-500/10 text-emerald-500" };
    if (v === "off" || v === "low") return { txt: "Baixo", cls: "bg-amber-500/10 text-amber-500" };
    return { txt: "Base", cls: "bg-muted text-muted-foreground" };
  };
  return (
    <div className="space-y-2">
      {!cycleEnabled && (
        <p className="text-xs text-muted-foreground italic px-1">
          Ciclo de carbo desativado — todos os dias seguem a base.
        </p>
      )}
      {WEEKDAYS.map((d) => {
        const lbl = dayLabel((cc as Record<string, string>)[d.key] ?? "base");
        const note = notes[d.key];
        return (
          <Card key={d.key} className="bg-card border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{d.label}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${lbl.cls}`}>
                {lbl.txt}
              </span>
            </div>
            {note && (
              <p className="text-xs text-muted-foreground mt-1.5 italic">{note}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}