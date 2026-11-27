/**
 * WorkoutsTab.tsx — aba "Treinos" do ProtocolBuilder.
 */
import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, ChevronDown, CheckCircle2, GripVertical,
  StretchHorizontal, Dumbbell, Library, CopyPlus,
} from "lucide-react";
import { toast } from "sonner";
import { ExercisePickerInput } from "@/components/coach/ExercisePickerInput";
import { ExerciseSubstitutesPopover } from "@/components/coach/ExerciseSubstitutesPopover";
import { CoachExerciseLibraryDialog, type LibraryPickItem } from "@/components/coach/CoachExerciseLibraryDialog";
import { MobilityTemplateBar } from "@/components/coach/MobilityTemplateBar";

import WorkoutPeriodizationEditor from "../WorkoutPeriodizationEditor";
import { WeeklyVolumeDashboard } from "./WeeklyVolumeDashboard";
import { ProtocolPayload, makeEmptyExercise, isMobilityExercise, isLegacyMobilityExercise } from "@/lib/protocolSchema";
import { applyDayExercisesChange, buildExercisesWithLibraryAdditions } from "@/lib/workoutExerciseOps";
import { duplicateWorkoutDay, nextWorkoutKey } from "@/lib/workoutDayOps";
import { normalizeCarb, cycleCarb, DAY_KEYS } from "@/lib/weekCycle";
import { useConfirm } from "@/components/ConfirmProvider";
import { WorkoutTemplateQuickPicker } from "@/components/coach/WorkoutTemplateQuickPicker";
import { makeInvertSetting, type InvertMode } from "@/lib/workoutInversion";
import { PeriodizationTemplateQuickPicker } from "@/components/coach/PeriodizationTemplateQuickPicker";
import { RX_FIELDS, exceptionValue, setExceptionAllWeeks, type RxField } from "@/lib/prescriptionResolve";
import { CardioSection, ExerciseMenu, InvertBadge, RxInput, WeekStripEditor, WorkoutMenu } from "./WorkoutsTabParts";
import { ModelsMenu } from "./ModelsMenu";

import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

/**
 * `variant="busyWeek"`: mesmo editor, usado na Semana Corrida — com a mesma
 * faixa da semana (dias + carbo), só sem aeróbicos e sem o atalho da
 * biblioteca de protocolos.
 *
 * Limpeza de 20/11/2026 (auditoria aprovada): dias só na faixa da semana,
 * ações em menus ⋯, um botão "Modelos", aeróbicos num lugar só, campos com
 * rótulo no celular e a regra única da periodização (prescriptionResolve).
 */
/**
 * Botão "Modelos" do Treino: aplicar/salvar treino e periodização + biblioteca.
 * No protocolo ele fica na linha do "Treino atual | Semana corrida" (canto
 * direito, como nas outras abas); na Semana corrida, dentro do editor.
 */
export function WorkoutModelsMenu({
  payload, setPayload, coachId, onOpenLibrary,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
  onOpenLibrary?: () => void;
}) {
  return (
    <ModelsMenu
      sections={[
        { title: "Treino", content: <WorkoutTemplateQuickPicker payload={payload} setPayload={setPayload} coachId={coachId} /> },
        { title: "Periodização", content: <PeriodizationTemplateQuickPicker payload={payload} setPayload={setPayload} coachId={coachId} /> },
      ]}
      onOpenLibrary={onOpenLibrary}
    />
  );
}

export function WorkoutsTab({
  payload, setPayload, coachId, onOpenTemplateLibrary, variant = "protocol", hideModelsMenu = false, onOpenMacros,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
  onOpenTemplateLibrary?: () => void;
  variant?: "protocol" | "busyWeek";
  /** O protocolo desenha o "Modelos" na linha de cima (mesmo canto das outras abas). */
  hideModelsMenu?: boolean;
  /** Atalho da faixa da semana para ligar o ciclo de carbo em Macros. */
  onOpenMacros?: () => void;
}) {
  const isBusy = variant === "busyWeek";
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
  }, []);

  const confirm = useConfirm();
  const updDay = (idx: number, patch: Partial<ProtocolPayload["workouts"][number]>) => { const n = [...payload.workouts]; n[idx] = { ...n[idx], ...patch }; setPayload({ ...payload, workouts: n }); };
  const updEx = (di: number, ei: number, patch: any) => { const n = [...payload.workouts]; const exs = [...n[di].exercises]; exs[ei] = { ...exs[ei], ...patch }; n[di] = { ...n[di], exercises: exs }; setPayload({ ...payload, workouts: n }); };
  const removeExerciseAt = (di: number, ei: number) => {
    const nextExercises = payload.workouts[di].exercises.filter((_, i) => i !== ei);
    setPayload(applyDayExercisesChange(payload, di, nextExercises));
  };
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
    const exs = [...payload.workouts[di].exercises];
    [exs[a], exs[b]] = [exs[b], exs[a]];
    setPayload(applyDayExercisesChange(payload, di, exs));
  };

  const [libraryDayIndex, setLibraryDayIndex] = useState<number | null>(null);
  const insertFromLibrary = (di: number, items: LibraryPickItem[]) => {
    const additions = items.map((item) => ({
      ...makeEmptyExercise(),
      name: item.displayName,
      gifKey: item.key,
    }));
    const nextExercises = buildExercisesWithLibraryAdditions(payload.workouts[di].exercises as any, additions);
    setPayload(applyDayExercisesChange(payload, di, nextExercises));
  };

  const replicateBaseConfig = async (di: number, strengthList: Array<{ ex: any; ei: number }>) => {
    if (strengthList.length < 2) return;
    const [{ ex: source, ei: sourceEi }, ...rest] = strengthList;
    if (!(await confirm({
      title: "Replicar configuração",
      description: `Copiar séries, reps, cadência e descanso de "${source.name || "exercício 1"}" para os outros ${rest.length} exercício(s) de força deste treino?`,
      confirmLabel: "Replicar",
    }))) return;
    const fields = {
      sets: source.sets ?? "",
      reps: source.reps ?? "",
      rest: source.rest ?? "",
      cadence: source.cadence ?? "",
    };
    const targetEis = new Set(rest.map((r) => r.ei));
    const nextExercises = payload.workouts[di].exercises.map((exercise, i) =>
      i === sourceEi || !targetEis.has(i) ? exercise : { ...exercise, ...fields }
    );
    setPayload(applyDayExercisesChange(payload, di, nextExercises));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    const reordered = arrayMove(strength.map((s) => s.ex), oldIndex, newIndex);
    const nextExs = [...exs];
    strength.forEach(({ ei }, k) => { nextExs[ei] = reordered[k]; });
    setPayload(applyDayExercisesChange(payload, di, nextExs));
  };

  const moveDay = (di: number, direction: "up" | "down") => {
    const n = [...payload.workouts];
    const targetIdx = direction === "up" ? di - 1 : di + 1;
    if (targetIdx < 0 || targetIdx >= n.length) return;
    [n[di], n[targetIdx]] = [n[targetIdx], n[di]];
    setPayload({ ...payload, workouts: n });
  };

  /** Acrescenta um bloco de treino no fim, preservando todo o resto do rascunho. */
  const addDay = () => {
    setPayload({
      ...payload,
      workouts: [...payload.workouts, { key: nextWorkoutKey(payload.workouts), focus: "", exercises: [makeEmptyExercise()] }],
    } as ProtocolPayload);
  };

  /** Duplica um treino (exercícios, overrides de periodização e aeróbicos dele) no fim da lista. */
  const [scrollToKey, setScrollToKey] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToKey) return;
    document.getElementById(`workout-day-${scrollToKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setScrollToKey(null);
  }, [scrollToKey, payload.workouts]);

  const duplicateDay = (di: number) => {
    const result = duplicateWorkoutDay(payload, di);
    if (!result) return;
    setPayload(result.payload);
    setScrollToKey(result.newKey);
    toast.success(`Treino ${positionLetter(di)} duplicado como Treino ${positionLetter(result.newIndex)}.${isBusy ? "" : " Vincule os dias da semana dele."}`);
  };

  /** Remove um bloco de treino + vínculos de dia da semana + overrides da periodização. */
  const removeDay = async (di: number) => {
    const day = payload.workouts[di];
    if (!(await confirm({
      title: `Excluir Treino ${positionLetter(di)}?`,
      description: `Os exercícios deste bloco serão removidos. Os demais treinos permanecem intactos.`,
      confirmLabel: "Excluir",
      destructive: true,
    }))) return;

    const nextWeekDays: Record<string, string> = {};
    for (const [wd, wk] of Object.entries(weekDays)) if (wk !== day.key) nextWeekDays[wd] = wk;

    const per: any = payload.periodization;
    let nextPer = per;
    if (per?.overrides) {
      const ov: Record<string, any> = {};
      for (const [weekIdx, byEx] of Object.entries(per.overrides as Record<string, Record<string, any>>)) {
        const kept: Record<string, any> = {};
        for (const [exKey, val] of Object.entries(byEx ?? {})) {
          if (!exKey.startsWith(`${day.key}_`)) kept[exKey] = val;
        }
        ov[weekIdx] = kept;
      }
      nextPer = { ...per, overrides: ov };
    }

    setPayload({
      ...payload,
      workouts: payload.workouts.filter((_, i) => i !== di),
      weekDays: nextWeekDays,
      ...(nextPer ? { periodization: nextPer } : {}),
    } as any);
  };

  const periodOn = !!payload.periodization?.enabled;
  const [mobOpen, setMobOpen] = useState<Record<number, boolean>>({});
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const toggleCollapsed = (key: string) =>
    setCollapsedDays((s) => ({ ...s, [key]: !s[key] }));


  const weekDays: Record<string, string> = (payload as any).weekDays ?? {};
  const ABBR: Record<string, string> = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };
  const today = (["dom","seg","ter","qua","qui","sex","sab"] as const)[new Date().getDay()];

  /** Faixa da semana: "" limpa o dia, "REST" = descanso, senão a chave do treino. */
  const setDay = (weekdayKey: string, value: string) => {
    const next: Record<string, string> = { ...weekDays };
    if (!value) delete next[weekdayKey];
    else next[weekdayKey] = value;
    setPayload({ ...payload, weekDays: next } as any);
  };

  const cyclePillCarb = (k: string) => {
    const cur = normalizeCarb((payload.carbCycle as any)?.[k]);
    setPayload({
      ...payload,
      carbCycle: { ...(payload.carbCycle ?? {}), [k]: cycleCarb(cur) } as any,
    });
  };

  const positionLetter = (i: number) => String.fromCharCode(65 + i);

  const workoutKeyToLetter: Record<string, string> = {};
  payload.workouts.forEach((w, i) => { workoutKeyToLetter[w.key] = positionLetter(i); });
  const displayLetter = (workoutKey: string) => workoutKeyToLetter[workoutKey] ?? workoutKey;

  const restDays = DAY_KEYS.filter((k) => weekDays[k] === "REST");
  /** "4 a 5 séries" → "4–5": cabe no campo estreito (o valor inteiro está na periodização). */
  const compactWeekValue = (v: string) =>
    String(v ?? "").replace(/\s*(séries|série|reps|rep|repetições)\b/gi, "").replace(/\s+a\s+/gi, "–").trim();
  const w1 = payload.periodization?.weeks?.[0];

  /** Valor e marca de cada campo de prescrição (regra única: src/lib/prescriptionResolve.ts). */
  const rxView = (day: ProtocolPayload["workouts"][number], ex: { __id?: string } & Partial<Record<RxField, string>>, ei: number, field: RxField) => {
    if (!periodOn) {
      return {
        value: ex[field] ?? "",
        placeholder: ({ sets: "Ex: 4", reps: "Ex: 8-12", cadence: "Ex: 3010", rest: "Ex: 60s" } as const)[field],
        exception: false,
        mixed: false,
      };
    }
    const exc = exceptionValue(payload.periodization as never, day.key, ei, ex.__id, field);
    return {
      value: exc.value,
      placeholder: w1?.[field] ? `S1 ${compactWeekValue(w1[field])}` : "pela semana",
      exception: !!exc.value,
      mixed: exc.mixed,
    };
  };
  const setRx = (di: number, ei: number, field: RxField, value: string) => {
    if (!periodOn) { updEx(di, ei, { [field]: value }); return; }
    const day = payload.workouts[di];
    const ex = day.exercises[ei] as { __id?: string };
    setPayload({
      ...payload,
      periodization: setExceptionAllWeeks(payload.periodization as never, day.key, ei, ex.__id, field, value) as never,
    });
  };

  const [altOpen, setAltOpen] = useState<string | null>(null);
  const [obsOpen, setObsOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-3">
      {!hideModelsMenu && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <WorkoutModelsMenu payload={payload} setPayload={setPayload} coachId={coachId} onOpenLibrary={!isBusy ? onOpenTemplateLibrary : undefined} />
        </div>
      )}

      <WeekStripEditor
        workouts={payload.workouts}
        weekDays={weekDays}
        carbCycle={(payload.carbCycle ?? {}) as Record<string, unknown>}
        today={today}
        letterOf={displayLetter}
        onSetDay={setDay}
        onCycleCarb={cyclePillCarb}
        // Semana corrida: o carbo por dia continua sempre visível (pedido de 20/11).
        showCarb={isBusy || !!payload.setup?.carbCycle}
        onOpenMacros={!isBusy ? onOpenMacros : undefined}
      />

      <WorkoutPeriodizationEditor payload={payload} setPayload={setPayload} coachId={coachId} />

      <WeeklyVolumeDashboard workouts={payload.workouts} weekDays={weekDays} periodization={payload.periodization} />

      {periodOn && payload.workouts.length > 0 && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground/80" data-testid="periodization-rule-note">
          Periodização ligada: séries, reps, cadência e descanso seguem a semana (em cinza). Digitar num exercício cria uma
          exceção só para ele, nas 4 semanas (campo com borda dourada).
        </p>
      )}

      {payload.workouts.map((day, di) => {
      const { strength: strengthList, mobility: mobilityList } = splitExercises(day);
      const isCollapsed = !!collapsedDays[day.key];
      const linkedDays = DAY_KEYS.filter((k) => weekDays[k] === day.key).map((k) => ABBR[k]);
      const invertMode = (day.invert?.mode ?? "off") as InvertMode;
      return (
        <Card key={day.key} id={`workout-day-${day.key}`} className="bg-card/60 border-border p-3 sm:p-4 scroll-mt-20" data-testid={`workout-card-${day.key}`}>

          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-base shrink-0">{positionLetter(di)}</div>
            <div className="flex-1 min-w-0">
              <Input
                value={day.focus}
                onChange={(e) => updDay(di, { focus: e.target.value })}
                placeholder="Nome do treino (ex: Inferiores · glúteo)"
                className="h-9 text-base font-bold w-full border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40 px-2"
              />
              <p className="px-2 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap" data-testid={`workout-days-${day.key}`}>
                {linkedDays.length ? linkedDays.join(" · ") : "Sem dia na semana"}
                <InvertBadge mode={invertMode} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleCollapsed(day.key)}
              className="text-muted-foreground hover:text-primary p-1.5 shrink-0"
              title={isCollapsed ? "Expandir treino" : "Minimizar treino"}
              aria-label={isCollapsed ? "Expandir treino" : "Minimizar treino"}
            >
              <ChevronDown className={cn("w-4 h-4 transition-transform", isCollapsed && "-rotate-90")} />
            </button>
            <WorkoutMenu
              letter={positionLetter(di)}
              invertMode={invertMode}
              canMoveUp={di > 0}
              canMoveDown={di < payload.workouts.length - 1}
              onInvert={(m) => updDay(di, { invert: makeInvertSetting(m) })}
              onInvertAll={() => {
                const setting = day.invert?.mode && day.invert.mode !== "off" ? makeInvertSetting(day.invert.mode) : undefined;
                setPayload({ ...payload, workouts: payload.workouts.map((w) => ({ ...w, invert: setting })) });
                toast.success("Regra de inverter aplicada em todos os treinos.");
              }}
              onDuplicate={() => duplicateDay(di)}
              onMove={(dir) => moveDay(di, dir)}
              onDelete={() => removeDay(di)}
            />
          </div>

          {isCollapsed && (
            <p className="text-[11px] text-muted-foreground -mt-1">
              {strengthList.length} exercício(s) · {mobilityList.length} mobilidade — minimizado
            </p>
          )}

          {!isCollapsed && (<>
          <div className="space-y-2">
            {/* ── Mobilidade / Alongamento ── */}
            {mobilityList.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMobOpen((s) => ({ ...s, [di]: s[di] === false ? true : false }))}
                    className="flex items-center gap-1.5 text-xs font-bold text-sky-500 whitespace-nowrap"
                  >
                    <StretchHorizontal className="w-3.5 h-3.5" /> Mobilidade pré-treino
                    <span className="text-[11px] font-normal text-muted-foreground">({mobilityList.length})</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", mobOpen[di] === false && "-rotate-90")} />
                  </button>
                  <div className="ml-auto">
                    <MobilityTemplateBar
                      coachId={coachId}
                      currentMobility={mobilityList.map(({ ex }) => ex)}
                      onApply={(exercises) => {
                        const additions = exercises.map((exercise) => exercise.__id ? exercise : { ...exercise, __id: makeEmptyExercise().__id });
                        setPayload(applyDayExercisesChange(payload, di, [...day.exercises, ...additions]));
                        setMobOpen((s) => ({ ...s, [di]: true }));
                      }}
                    />
                  </div>
                </div>

                {mobOpen[di] !== false && mobilityList.map(({ ex, ei }) => (
                  <div key={(ex as any).__id ?? `mob-${ei}`} className="grid grid-cols-2 md:grid-cols-[1.8fr_0.8fr_0.8fr_1.4fr_auto] gap-2 items-end md:items-center rounded-lg border border-sky-500/20 bg-background/40 p-2">
                    <div className="col-span-2 md:col-span-1 min-w-0">
                      <ExercisePickerInput
                        value={ex.name}
                        gifKey={(ex as any).gifKey}
                        onChange={(patch) => updEx(di, ei, patch)}
                        placeholder="Ex: Mobilidade de quadril"
                      />
                    </div>
                    <label className="block"><span className="md:hidden block text-[11px] uppercase text-muted-foreground mb-0.5">Séries</span>
                      <Input value={ex.sets ?? ""} onChange={(e) => updEx(di, ei, { sets: e.target.value })} placeholder="Ex: 2" className="h-8 text-base md:text-sm" aria-label="Séries" /></label>
                    <label className="block"><span className="md:hidden block text-[11px] uppercase text-muted-foreground mb-0.5">Tempo/Reps</span>
                      <Input value={ex.reps ?? ""} onChange={(e) => updEx(di, ei, { reps: e.target.value })} placeholder="Ex: 30s" className="h-8 text-base md:text-sm" aria-label="Tempo ou repetições" /></label>
                    <Input value={ex.notes ?? ""} onChange={(e) => updEx(di, ei, { notes: e.target.value })} placeholder="Obs" className="h-8 text-base md:text-sm col-span-2 md:col-span-1" />
                    <div className="flex items-center gap-0.5 justify-self-end col-span-2 md:col-span-1">
                      {isLegacyMobilityExercise(ex) && (
                        <button
                          type="button"
                          onClick={() => updEx(di, ei, { is_mobility: true })}
                          className="text-sky-500 hover:text-sky-400 p-1.5"
                          title="Corrigir: marcar como mobilidade permanentemente"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updEx(di, ei, { is_mobility: false })}
                        className="text-muted-foreground hover:text-foreground p-1.5"
                        title="Não é mobilidade — mover para o treino de força"
                      >
                        <Dumbbell className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeExerciseAt(di, ei)}
                        className="text-muted-foreground hover:text-destructive p-1.5"
                        title="Remover mobilidade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Força ── */}
            {strengthList.length > 0 && (
              <div className="hidden md:grid gap-2 px-1 pb-1 grid-cols-[auto_1.8fr_0.7fr_0.6fr_0.6fr_0.6fr_1fr_auto]">
                <span className="w-5"></span>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Exercício</span>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Séries</span>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Reps</span>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground cursor-help flex items-center gap-1" title="3010 = Excêntrico / Pausa / Concêntrico / Pausa">Cadência ⓘ</span>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Descanso</span>
                <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Obs</span>
                <span className="w-8"></span>
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
              const rowId = (ex as any).__id ?? `${day.key}-${ei}`;
              const subs = ((ex as any).allowed_substitutes ?? []) as string[];
              const showObs = !!ex.notes || !!obsOpen[rowId];
              return (
              <SortableExerciseRow
                key={rowId}
                id={rowId}
                className="rounded-lg md:rounded-none border md:border-0 border-border/40 p-2 md:p-0 grid grid-cols-[auto_1fr_auto] gap-x-1.5 gap-y-1.5 items-center md:grid-cols-[auto_1.8fr_0.7fr_0.6fr_0.6fr_0.6fr_1fr_auto]"
              >
              {({ attributes, listeners }) => (<>
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  className="text-muted-foreground hover:text-primary p-0.5 cursor-grab active:cursor-grabbing touch-none self-center"
                  title="Arrastar para reordenar"
                  aria-label="Arrastar exercício"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <div className="min-w-0 flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <ExercisePickerInput
                      value={ex.name}
                      gifKey={(ex as any).gifKey}
                      onChange={(patch) => updEx(di, ei, patch)}
                      placeholder="Ex: Supino reto"
                      coachId={coachId}
                      onPrescriptionRestore={periodOn ? undefined : (rx) => {
                        // Memória de prescrição: preenche só o que está vazio.
                        const patch: Record<string, string> = {};
                        for (const k of RX_FIELDS) if (!String(ex[k] ?? "").trim() && rx[k]) patch[k] = String(rx[k]);
                        if (Object.keys(patch).length) updEx(di, ei, patch);
                      }}
                      onQuickPreset={periodOn || !(String(ex.name ?? "").trim()) || ex.sets || ex.reps ? undefined : (preset) => updEx(di, ei, preset)}
                    />
                  </div>
                  <ExerciseSubstitutesPopover
                    exerciseName={ex.name}
                    gifKey={(ex as any).gifKey}
                    value={subs}
                    onChange={(next) => updEx(di, ei, { allowed_substitutes: next } as any)}
                    open={altOpen === rowId}
                    onOpenChange={(v) => setAltOpen(v ? rowId : null)}
                    hideWhenEmpty
                  />
                </div>
                <div className="md:hidden justify-self-end">
                  <ExerciseMenu
                    name={ex.name}
                    substitutesCount={subs.length}
                    canMoveUp={si > 0}
                    canMoveDown={si < strengthList.length - 1}
                    onAlternatives={() => setTimeout(() => setAltOpen(rowId), 0)}
                    onToMobility={() => { updEx(di, ei, { is_mobility: true }); setMobOpen((s) => ({ ...s, [di]: true })); }}
                    onMove={(dir) => swapStrength(di, strengthList, si, dir)}
                    onDelete={() => removeExerciseAt(di, ei)}
                  />
                </div>

                <div className="col-span-3 md:col-span-4 grid grid-cols-4 gap-1.5 md:contents">
                  {RX_FIELDS.map((field) => {
                    const v = rxView(day, ex, ei, field);
                    return (
                      <RxInput
                        key={field}
                        field={field}
                        value={v.value}
                        placeholder={v.placeholder}
                        exception={v.exception}
                        mixed={v.mixed}
                        onChange={(val) => setRx(di, ei, field, val)}
                      />
                    );
                  })}
                </div>

                <div className={cn("col-span-3 md:col-span-1 min-w-0", !showObs && "hidden md:block")}>
                  <Input value={ex.notes} onChange={(e) => updEx(di, ei, { notes: e.target.value })} placeholder="Obs" className="h-8 text-base md:text-sm min-w-0" aria-label="Observação" />
                </div>
                {!showObs && (
                  <button
                    type="button"
                    onClick={() => setObsOpen((s) => ({ ...s, [rowId]: true }))}
                    className="md:hidden col-span-3 justify-self-start text-[11px] text-primary"
                  >
                    + obs
                  </button>
                )}

                <div className="hidden md:block justify-self-end">
                  <ExerciseMenu
                    name={ex.name}
                    substitutesCount={subs.length}
                    canMoveUp={si > 0}
                    canMoveDown={si < strengthList.length - 1}
                    onAlternatives={() => setTimeout(() => setAltOpen(rowId), 0)}
                    onToMobility={() => { updEx(di, ei, { is_mobility: true }); setMobOpen((s) => ({ ...s, [di]: true })); }}
                    onMove={(dir) => swapStrength(di, strengthList, si, dir)}
                    onDelete={() => removeExerciseAt(di, ei)}
                  />
                </div>

                {si === 0 && strengthList.length > 1 && !periodOn && (
                  <button
                    type="button"
                    onClick={() => replicateBaseConfig(di, strengthList)}
                    className="col-span-3 md:col-start-2 md:col-span-6 justify-self-start inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    title="Copia séries, reps, cadência e descanso deste exercício para os demais de força do treino"
                  >
                    <CopyPlus className="w-3 h-3" /> Replicar configuração para os outros ⬇️
                  </button>
                )}
              </>)}
              </SortableExerciseRow>
              );
            })}
              </SortableContext>
            </DndContext>

            <div className="flex flex-wrap gap-2 mt-1">
              <Button size="sm" variant="outline" onClick={() => setPayload(applyDayExercisesChange(payload, di, [...day.exercises, makeEmptyExercise()]))} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Exercício</Button>
              <Button size="sm" variant="outline" onClick={() => setLibraryDayIndex(di)} className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"><Library className="w-3 h-3 mr-1" /> Buscar exercício</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPayload(applyDayExercisesChange(payload, di, [...day.exercises, makeEmptyExercise({ isMobility: true })]))}
                className="h-7 text-xs border-sky-500/50 text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
              >
                <StretchHorizontal className="w-3 h-3 mr-1" /> Mobilidade
              </Button>
              {mobilityList.length === 0 && (
                <MobilityTemplateBar
                  coachId={coachId}
                  currentMobility={[]}
                  applyOnly
                  onApply={(exercises) => {
                    const additions = exercises.map((exercise) => exercise.__id ? exercise : { ...exercise, __id: makeEmptyExercise().__id });
                    setPayload(applyDayExercisesChange(payload, di, [...day.exercises, ...additions]));
                    setMobOpen((s) => ({ ...s, [di]: true }));
                  }}
                />
              )}
            </div>
          </div>
          </>)}
        </Card>
      );
      })}

      <Button variant="outline" className="w-full border-dashed" onClick={addDay}>
        <Plus className="w-4 h-4 mr-2" /> Adicionar treino ({positionLetter(payload.workouts.length)})
      </Button>

      {/* ── Descanso: observação dos dias de descanso (os dias escolhem-se na faixa da semana) ── */}
      <Card className="bg-card/40 border-dashed border-border/60 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-black text-xs shrink-0">OFF</div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold leading-tight">Descanso</p>
            <p className="text-[11px] text-muted-foreground">
              {restDays.length ? restDays.map((k) => ABBR[k]).join(" · ") : "Nenhum dia de descanso marcado"} — escolha os dias na faixa da semana.
            </p>
          </div>
        </div>
        <Textarea
          value={(payload as any).restNotes ?? ""}
          onChange={(e) => setPayload({ ...payload, restNotes: e.target.value } as any)}
          placeholder="Observação opcional para os dias de descanso (ex.: mobilidade leve, caminhada, sono/recuperação)."
          className="min-h-[60px] text-base md:text-sm bg-background/60"
        />
      </Card>

      {!isBusy && (
        <CardioSection
          cardio={payload.cardio ?? []}
          workouts={payload.workouts}
          weekDays={weekDays}
          letterOf={displayLetter}
          onChange={(next) => setPayload({ ...payload, cardio: next })}
        />
      )}

      <CoachExerciseLibraryDialog
        open={libraryDayIndex !== null}
        onOpenChange={(v) => { if (!v) setLibraryDayIndex(null); }}
        dayLabel={libraryDayIndex !== null ? `Treino ${positionLetter(libraryDayIndex)}` : undefined}
        existingKeys={
          libraryDayIndex !== null
            ? (payload.workouts[libraryDayIndex]?.exercises ?? []).map((e: any) => e.gifKey).filter(Boolean)
            : undefined
        }
        onConfirm={(items) => {
          if (libraryDayIndex === null) return;
          insertFromLibrary(libraryDayIndex, items);
        }}
      />
    </div>
  );
}
