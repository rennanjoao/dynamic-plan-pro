/**
 * WorkoutsTab.tsx — aba "Treinos" do ProtocolBuilder.
 * Extraído de ProtocolBuilder.tsx sem alteração de comportamento.
 */
import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, CheckCircle2, GripVertical, Activity,
  StretchHorizontal,
} from "lucide-react";
import { ExercisePickerInput } from "@/components/coach/ExercisePickerInput";
import { ExerciseSubstitutesPopover } from "@/components/coach/ExerciseSubstitutesPopover";
import WorkoutPeriodizationEditor from "../WorkoutPeriodizationEditor";
import { ProtocolPayload, makeEmptyExercise, isMobilityExercise, isLegacyMobilityExercise } from "@/lib/protocolSchema";
import { normalizeCarb, cycleCarb, CARB_LABEL, DAY_KEYS } from "@/lib/weekCycle";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── WorkoutsTab ─────────────────────────────────────────────────────────────

// Linha sortable para drag-and-drop de exercícios. Aplica transform no
// próprio grid-row (mantém o layout original) e delega os listeners a um
// handle dedicado (ícone GripVertical) para não interferir nos inputs.
function SortableExerciseRow({
  id, className, children,
}: { id: string; className?: string; children: (handle: { attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

export function WorkoutsTab({ payload, setPayload, coachId, onOpenTemplateLibrary }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void; coachId: string | null; onOpenTemplateLibrary?: () => void }) {
  // [FIX Tarefa 10] Backfill de __id em exercícios carregados de protocolos
  // antigos (que não tinham esse campo). Roda uma única vez por payload,
  // apenas se algum exercício estiver sem __id — evita loop de setPayload.
  useEffect(() => {
    const needs = payload.workouts.some((d) => d.exercises.some((e: any) => !e.__id));
    if (!needs) return;
    const gen = () =>
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `ex_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    const nextWorkouts = payload.workouts.map((d) => ({
      ...d,
      exercises: d.exercises.map((e: any) => (e.__id ? e : { ...e, __id: gen() })),
    }));
    setPayload({ ...payload, workouts: nextWorkouts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updDay = (idx: number, patch: Partial<ProtocolPayload["workouts"][number]>) => { const n = [...payload.workouts]; n[idx] = { ...n[idx], ...patch }; setPayload({ ...payload, workouts: n }); };
  const updEx = (di: number, ei: number, patch: any) => { const n = [...payload.workouts]; const exs = [...n[di].exercises]; exs[ei] = { ...exs[ei], ...patch }; n[di] = { ...n[di], exercises: exs }; setPayload({ ...payload, workouts: n }); };
  // Move um item de força para a posição do vizinho de FORÇA (ignorando itens
  // de mobilidade que possam estar entre eles no array completo).
  const swapStrength = (
    di: number,
    strengthList: Array<{ ex: any; ei: number }>,
    si: number,
    direction: "up" | "down",
  ) => {
    const targetSi = direction === "up" ? si - 1 : si + 1;
    if (targetSi < 0 || targetSi >= strengthList.length) return;
    const a = strengthList[si].ei;
    const b = strengthList[targetSi].ei;
    const n = [...payload.workouts];
    const exs = [...n[di].exercises];
    [exs[a], exs[b]] = [exs[b], exs[a]];
    n[di] = { ...n[di], exercises: exs };
    setPayload({ ...payload, workouts: n });
  };
  // Sensors: só inicia drag após 5px de movimento p/ não interferir em cliques
  // nos botões (mover, deletar, picker de exercício, etc.).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Separa força (lista principal) de mobilidade/alongamento, preservando o
  // índice original de cada item no array `exercises` (usado por updEx).
  const splitExercises = (day: ProtocolPayload["workouts"][number]) => {
    const strength: Array<{ ex: any; ei: number }> = [];
    const mobility: Array<{ ex: any; ei: number }> = [];
    (day.exercises as any[]).forEach((ex, ei) => {
      (isMobilityExercise(ex) ? mobility : strength).push({ ex, ei });
    });
    return { strength, mobility };
  };
  const handleDragEnd = (di: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const exs = payload.workouts[di].exercises as any[];
    const { strength } = splitExercises(payload.workouts[di]);
    const ids = strength.map(({ ex, ei }) => ex.__id ?? `${payload.workouts[di].key}-${ei}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    // Reordena apenas os itens de força, mantendo as posições ocupadas por
    // mobilidade intactas dentro do array completo.
    const reordered = arrayMove(strength.map((s) => s.ex), oldIndex, newIndex);
    const nextExs = [...exs];
    strength.forEach(({ ei }, k) => { nextExs[ei] = reordered[k]; });
    const n = [...payload.workouts];
    n[di] = { ...n[di], exercises: nextExs };
    setPayload({ ...payload, workouts: n });
  };
  // Reordena o CARD do dia inteiro (ex: mover "Perna" para cima de "Peito")
  const moveDay = (di: number, direction: "up" | "down") => {
    const n = [...payload.workouts];
    const targetIdx = direction === "up" ? di - 1 : di + 1;
    if (targetIdx < 0 || targetIdx >= n.length) return;
    [n[di], n[targetIdx]] = [n[targetIdx], n[di]];
    setPayload({ ...payload, workouts: n });
  };
  const periodOn = !!payload.periodization?.enabled;
  const [overrideOpen, setOverrideOpen] = useState<Record<number, boolean>>({});
  // Colapso independente do bloco de mobilidade por dia (default: aberto).
  const [mobOpen, setMobOpen] = useState<Record<number, boolean>>({});


  // ── Map auxiliar e helpers de week strip ───────────────────────────────────
  const weekDays: Record<string, string> = (payload as any).weekDays ?? {};
  const ABBR: Record<string, string> = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };
  const today = (["dom","seg","ter","qua","qui","sex","sab"] as const)[new Date().getDay()];

  const setWeekday = (weekdayKey: string, workoutKey: string) => {
    const next: Record<string, string> = { ...weekDays };
    if (workoutKey === "" || next[weekdayKey] === workoutKey) delete next[weekdayKey];
    else next[weekdayKey] = workoutKey;
    setPayload({ ...payload, weekDays: next } as any);
  };

  const cyclePillCarb = (k: string) => {
    const cur = normalizeCarb((payload.carbCycle as any)?.[k]);
    setPayload({
      ...payload,
      carbCycle: { ...(payload.carbCycle ?? {}), [k]: cycleCarb(cur) } as any,
    });
  };

  const dayChipText = (workoutKey: string) => {
    const linked = DAY_KEYS.filter((k) => weekDays[k] === workoutKey);
    return linked.length === 0 ? "Sem dia" : linked.map((k) => ABBR[k]).join(", ");
  };

  // [FIX Tarefa 9] A LETRA EXIBIDA do treino é derivada da POSIÇÃO no array
  // (A = primeiro, B = segundo, ...). O identificador estável `day.key`
  // continua sendo o valor gravado em workout_sessions.workout_key,
  // periodização, cardio associations, etc. — apenas o rótulo visual
  // é recalculado a cada render.
  const positionLetter = (i: number) => String.fromCharCode(65 + i);
  const workoutKeyToLetter: Record<string, string> = {};
  payload.workouts.forEach((w, i) => { workoutKeyToLetter[w.key] = positionLetter(i); });
  const displayLetter = (workoutKey: string) => workoutKeyToLetter[workoutKey] ?? workoutKey;

  return (
    <div className="space-y-3">
      <WorkoutPeriodizationEditor payload={payload} setPayload={setPayload} coachId={coachId} onOpenTemplateLibrary={onOpenTemplateLibrary} />

      {/* ── Week strip: pílulas Seg→Dom ── */}
      <Card className="bg-card/40 border-border p-2.5">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Semana</p>
          <p className="text-[9px] text-muted-foreground">Clique no carbo p/ alternar Alto · Base · Off</p>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAY_KEYS.map((k) => {
            const carb = normalizeCarb((payload.carbCycle as any)?.[k]);
            const wk = weekDays[k] ?? "";
            const isToday = k === today;
            return (
              <div
                key={k}
                className={cn(
                  "rounded-lg border bg-background/60 px-1 py-1 flex flex-col items-center gap-0.5",
                  isToday ? "border-[#CC0000]" : "border-border/40"
                )}
              >
                <span className="text-[9px] uppercase text-muted-foreground tracking-wider">{ABBR[k]}</span>
                <span className="text-[12px] font-bold text-foreground leading-none">{wk ? displayLetter(wk) : "—"}</span>
                <button
                  type="button"
                  onClick={() => cyclePillCarb(k)}
                  title={`Carbo ${CARB_LABEL[carb]} — clique para alternar`}
                  className={cn(
                    "text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded border leading-none mt-0.5",
                    carb === "high"
                      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/40"
                      : "bg-muted/40 text-muted-foreground border-border/50"
                  )}
                >
                  {CARB_LABEL[carb]}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {payload.workouts.map((day, di) => {
      const { strength: strengthList, mobility: mobilityList } = splitExercises(day);
      return (
        <Card key={day.key} className="bg-card/60 border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex flex-col -my-1">
              <button
                type="button"
                onClick={() => moveDay(di, "up")}
                disabled={di === 0}
                className="text-muted-foreground hover:text-primary p-0.5 disabled:opacity-20"
                title="Mover treino para cima"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveDay(di, "down")}
                disabled={di === payload.workouts.length - 1}
                className="text-muted-foreground hover:text-primary p-0.5 disabled:opacity-20"
                title="Mover treino para baixo"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-base shrink-0">{positionLetter(di)}</div>
            <Input
              value={day.focus}
              onChange={(e) => updDay(di, { focus: e.target.value })}
              placeholder="Nome do treino (ex: Dorsal · Peito · Inferiores)"
              className="h-10 text-base font-bold flex-1 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40 px-2"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/40 hover:bg-muted/60 border border-border/40 rounded-full px-2.5 py-1"
                  title="Dias da semana deste treino"
                >
                  {dayChipText(day.key)} <ChevronDown className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Aparece em</p>
                <div className="space-y-0.5">
                  {DAY_KEYS.map((k) => {
                    const checked = weekDays[k] === day.key;
                    const takenBy = weekDays[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setWeekday(k, day.key)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-muted/60",
                          checked && "bg-primary/10 text-primary font-semibold"
                        )}
                      >
                        <span>{ABBR[k]}</span>
                        {checked ? <CheckCircle2 className="w-3.5 h-3.5" /> : takenBy ? <span className="text-[9px] text-muted-foreground">→ {takenBy}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {periodOn && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="text-[11px] text-foreground/80">
                Periodização ativa: séries, reps, cadência e descanso são geridos por semana.
              </p>
              <Button
                size="sm"
                variant={overrideOpen[di] ? "default" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => setOverrideOpen((s) => ({ ...s, [di]: !s[di] }))}
              >
                {overrideOpen[di] ? "Ocultar campos base" : "Editar valores base"}
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {/* ── Mobilidade / Alongamento — sempre ACIMA dos exercícios de força,
                 com toggle próprio para minimizar só este bloco. ── */}
            {mobilityList.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 p-2 space-y-2">
                <button
                  type="button"
                  onClick={() => setMobOpen((s) => ({ ...s, [di]: s[di] === false ? true : false }))}
                  className="w-full flex items-center gap-1.5 text-xs font-bold text-sky-500"
                >
                  <StretchHorizontal className="w-3.5 h-3.5" /> Mobilidade pré-treino
                  <span className="text-[10px] font-normal text-muted-foreground">({mobilityList.length})</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 ml-auto transition-transform", mobOpen[di] === false && "-rotate-90")} />
                </button>
                {mobOpen[di] !== false && mobilityList.map(({ ex, ei }) => (
                  <div key={(ex as any).__id ?? `mob-${ei}`} className="grid grid-cols-1 md:grid-cols-[1.8fr_0.8fr_0.8fr_1.4fr_auto] gap-2 items-center rounded-lg border border-sky-500/20 bg-background/40 p-2">
                    <ExercisePickerInput
                      value={ex.name}
                      gifKey={(ex as any).gifKey}
                      onChange={(patch) => updEx(di, ei, patch)}
                      placeholder="Ex: Mobilidade de quadril"
                    />
                    <Input value={ex.sets ?? ""} onChange={(e) => updEx(di, ei, { sets: e.target.value })} placeholder="Séries (Ex: 2)" className="h-8 text-xs" />
                    <Input value={ex.reps ?? ""} onChange={(e) => updEx(di, ei, { reps: e.target.value })} placeholder="Tempo/Reps (Ex: 30s)" className="h-8 text-xs" />
                    <Input value={ex.notes ?? ""} onChange={(e) => updEx(di, ei, { notes: e.target.value })} placeholder="Obs" className="h-8 text-xs" />
                    {isLegacyMobilityExercise(ex) && (
                      <button
                        type="button"
                        onClick={() => updEx(di, ei, { is_mobility: true })}
                        className="text-sky-500 hover:text-sky-400 p-1.5 justify-self-end"
                        title="Corrigir: marcar como mobilidade permanentemente"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => updDay(di, { exercises: day.exercises.filter((_, i) => i !== ei) })}
                      className="text-muted-foreground hover:text-destructive p-1.5 justify-self-end"
                      title="Remover mobilidade"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {strengthList.length > 0 && (
              <div className={cn(
                "hidden md:grid gap-2 px-1 pb-1",
                periodOn && !overrideOpen[di]
                  ? "grid-cols-[1.8fr_1fr_auto]"
                  : "grid-cols-[1.8fr_0.6fr_0.6fr_0.6fr_0.6fr_1fr_auto]"
              )}>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Exercício</span>
                {(!periodOn || overrideOpen[di]) && (
                  <>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Séries</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Reps</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground cursor-help flex items-center gap-1" title="3010 = Excêntrico / Pausa / Concêntrico / Pausa">
                      Cadência ⓘ
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Descanso</span>
                  </>
                )}
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Obs</span>
                <span className="w-6"></span>
              </div>
            )}
            
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(di, e)}
            >
              <SortableContext
                items={strengthList.map(({ ex, ei }) => (ex as any).__id ?? `${day.key}-${ei}`)}
                strategy={verticalListSortingStrategy}
              >
            {strengthList.map(({ ex, ei }, si) => {
              const w1 = payload.periodization?.weeks?.[0];
              // Quando periodização ativa, pré-preenche campos vazios com valores da Semana 1
              const effSets    = ex.sets    || (periodOn && w1?.sets    ? w1.sets    : "");
              const effReps    = ex.reps    || (periodOn && w1?.reps    ? w1.reps    : "");
              const effCadence = ex.cadence || (periodOn && w1?.cadence ? w1.cadence : "");
              const effRest    = ex.rest    || (periodOn && w1?.rest    ? w1.rest    : "");
              const phSets    = periodOn && w1?.sets    ? `S1: ${w1.sets}`    : "Séries (Ex: 4)";
              const phReps    = periodOn && w1?.reps    ? `S1: ${w1.reps}`    : "Reps (Ex: 8-12)";
              const phCadence = periodOn && w1?.cadence ? `S1: ${w1.cadence}` : "Ex: 3010";
              const phRest    = periodOn && w1?.rest    ? `S1: ${w1.rest}`    : "Descanso (Ex: 60s)";
              const collapsed = periodOn && !overrideOpen[di];
              const rowId = (ex as any).__id ?? `${day.key}-${ei}`;
              return (
              <SortableExerciseRow
                key={rowId}
                id={rowId}
                className={cn(
                  "grid grid-cols-2 gap-2 items-center",
                  collapsed
                    ? "md:grid-cols-[1.8fr_1fr_auto]"
                    : "md:grid-cols-[1.8fr_0.6fr_0.6fr_0.6fr_0.6fr_1fr_auto]"
                )}
              >
              {({ attributes, listeners }) => (<>
                <ExercisePickerInput
                  value={ex.name}
                  gifKey={(ex as any).gifKey}
                  onChange={(patch) => updEx(di, ei, patch)}
                  placeholder="Ex: Supino reto"
                />
                {!collapsed && (
                  <>
                    <Input value={effSets} onChange={(e) => updEx(di, ei, { sets: e.target.value })} placeholder={phSets} className={cn("h-8 text-xs", periodOn && !ex.sets && effSets ? "text-muted-foreground italic" : "")} title={periodOn && !ex.sets ? "Valor da Semana 1 — edite para personalizar" : ""} />
                    <Input value={effReps} onChange={(e) => updEx(di, ei, { reps: e.target.value })} placeholder={phReps} className={cn("h-8 text-xs", periodOn && !ex.reps && effReps ? "text-muted-foreground italic" : "")} title={periodOn && !ex.reps ? "Valor da Semana 1 — edite para personalizar" : ""} />
                    <Input value={effCadence} onChange={(e) => updEx(di, ei, { cadence: e.target.value })} placeholder={phCadence} className={cn("h-8 text-xs", periodOn && !ex.cadence && effCadence ? "text-muted-foreground italic" : "")} title="3010 = Excêntrico / Pausa / Concêntrico / Pausa" />
                    <Input value={effRest} onChange={(e) => updEx(di, ei, { rest: e.target.value })} placeholder={phRest} className={cn("h-8 text-xs", periodOn && !ex.rest && effRest ? "text-muted-foreground italic" : "")} title={periodOn && !ex.rest ? "Valor da Semana 1 — edite para personalizar" : ""} />
                  </>
                )}
                <Input value={ex.notes} onChange={(e) => updEx(di, ei, { notes: e.target.value })} placeholder="Obs" className="h-8 text-xs" />
                <div className="flex items-center gap-0.5">
                  <ExerciseSubstitutesPopover
                    exerciseName={ex.name}
                    gifKey={(ex as any).gifKey}
                    value={((ex as any).allowed_substitutes ?? []) as string[]}
                    onChange={(next) => updEx(di, ei, { allowed_substitutes: next } as any)}
                  />
                  <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="text-muted-foreground hover:text-primary p-1 cursor-grab active:cursor-grabbing touch-none"
                    title="Arrastar para reordenar"
                    aria-label="Arrastar exercício"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => swapStrength(di, strengthList, si, "up")}
                    disabled={si === 0}
                    className="text-muted-foreground hover:text-primary p-1 disabled:opacity-30"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => swapStrength(di, strengthList, si, "down")}
                    disabled={si === strengthList.length - 1}
                    className="text-muted-foreground hover:text-primary p-1 disabled:opacity-30"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => updDay(di, { exercises: day.exercises.filter((_, i) => i !== ei) })} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </>)}
              </SortableExerciseRow>
              );
            })}
              </SortableContext>
            </DndContext>



            <div className="flex flex-wrap gap-2 mt-1">
              <Button size="sm" variant="outline" onClick={() => updDay(di, { exercises: [...day.exercises, makeEmptyExercise()] })} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Exercício</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updDay(di, { exercises: [...day.exercises, makeEmptyExercise({ isMobility: true })] })}
                className="h-7 text-xs border-sky-500/50 text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
              >
                <StretchHorizontal className="w-3 h-3 mr-1" /> Adicionar Mobilidade
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setPayload({
                    ...payload,
                    cardio: [
                      ...(payload.cardio ?? []),
                      {
                        type: "",
                        duration: "",
                        intensity: "",
                        workoutKey: day.key,
                        associationType: "workout" as const,
                        notes: "",
                      },
                    ],
                  })
                }
              >
                <Activity className="w-3 h-3 mr-1" /> Aeróbico neste treino
              </Button>
            </div>

            {(payload.cardio ?? []).filter((c) => c.workoutKey === day.key && c.associationType === "workout").length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" /> Aeróbico do Treino {positionLetter(di)}
                </p>
                {(payload.cardio ?? []).map((c, ci) => {
                  if (c.workoutKey !== day.key || c.associationType !== "workout") return null;
                  return (
                    <div key={ci} className="bg-background border border-border/50 rounded-lg p-2 space-y-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <Select
                          value={c.type || "Outro"}
                          onValueChange={(v) => {
                            const n = [...(payload.cardio ?? [])];
                            n[ci] = { ...n[ci], type: v };
                            setPayload({ ...payload, cardio: n });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                          <SelectContent>
                            {["AEJ","LISS","HIIT","Caminhada","Bicicleta","Outro"].map((t) => (
                              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => setPayload({ ...payload, cardio: (payload.cardio ?? []).filter((_, j) => j !== ci) })}
                          className="text-muted-foreground hover:text-destructive p-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Duração</Label>
                          <Input
                            value={c.duration}
                            onChange={(e) => {
                              const n = [...(payload.cardio ?? [])];
                              n[ci] = { ...n[ci], duration: e.target.value };
                              setPayload({ ...payload, cardio: n });
                            }}
                            placeholder="40 min"
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Intensidade</Label>
                          <Select
                            value={c.intensity || "Moderada"}
                            onValueChange={(v) => {
                              const n = [...(payload.cardio ?? [])];
                              n[ci] = { ...n[ci], intensity: v };
                              setPayload({ ...payload, cardio: n });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["Leve","Moderada","Alta"].map((t) => (
                                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Input
                        value={c.notes}
                        onChange={(e) => {
                          const n = [...(payload.cardio ?? [])];
                          n[ci] = { ...n[ci], notes: e.target.value };
                          setPayload({ ...payload, cardio: n });
                        }}
                        placeholder="Observações do aeróbico"
                        className="h-8 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      ); })}
      {/* ── Card especial: Descanso (key reservada "REST") ── */}
      <Card className="bg-card/40 border-dashed border-border/60 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-black text-[11px] shrink-0 uppercase tracking-wider">
            Off
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-foreground leading-tight">Descanso</p>
            <p className="text-[11px] text-muted-foreground">Dia sem treino — vincule aos dias da semana como qualquer outro treino.</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/40 hover:bg-muted/60 border border-border/40 rounded-full px-2.5 py-1"
                title="Dias da semana de descanso"
              >
                {dayChipText("REST")} <ChevronDown className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Aparece em</p>
              <div className="space-y-0.5">
                {DAY_KEYS.map((k) => {
                  const checked = weekDays[k] === "REST";
                  const takenBy = weekDays[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setWeekday(k, "REST")}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-muted/60",
                        checked && "bg-muted/60 text-foreground font-semibold"
                      )}
                    >
                      <span>{ABBR[k]}</span>
                      {checked ? <CheckCircle2 className="w-3.5 h-3.5" /> : takenBy ? <span className="text-[9px] text-muted-foreground">→ {takenBy}</span> : null}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Textarea
          value={(payload as any).restNotes ?? ""}
          onChange={(e) => setPayload({ ...payload, restNotes: e.target.value } as any)}
          placeholder="Observação opcional para os dias de descanso (ex.: mobilidade leve, caminhada, sono/recuperação)."
          className="min-h-[60px] text-xs bg-background/60"
        />
      </Card>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Aeróbicos</Label>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPayload({ ...payload, cardio: [...(payload.cardio ?? []), { type: "", duration: "", intensity: "", workoutKey: "", associationType: "workout", notes: "" }] })}><Plus className="w-3 h-3 mr-1" /> Aeróbico</Button>
        </div>
        {(payload.cardio ?? []).length === 0 && <p className="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border/40 rounded-lg">Nenhum aeróbico cadastrado.</p>}
        {(payload.cardio ?? []).map((c, ci) => (
          <Card key={ci} className="bg-card/60 border-border p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <Select value={c.type || "Outro"} onValueChange={(v) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], type: v }; setPayload({ ...payload, cardio: n }); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>{["AEJ","LISS","HIIT","Caminhada","Bicicleta","Outro"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
              </Select>
              <button onClick={() => setPayload({ ...payload, cardio: (payload.cardio ?? []).filter((_, j) => j !== ci) })} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><Label className="text-[10px] uppercase text-muted-foreground">Duração</Label><Input value={c.duration} onChange={(e) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], duration: e.target.value }; setPayload({ ...payload, cardio: n }); }} placeholder="40 min" className="h-8 text-xs mt-1" /></div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Intensidade</Label>
                <Select value={c.intensity || "Moderada"} onValueChange={(v) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], intensity: v }; setPayload({ ...payload, cardio: n }); }}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Leve","Moderada","Alta"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input value={c.notes} onChange={(e) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], notes: e.target.value }; setPayload({ ...payload, cardio: n }); }} placeholder="Observações" className="h-8 text-xs mt-2" />
          </Card>
        ))}
      </div>
    </div>
  );
}
