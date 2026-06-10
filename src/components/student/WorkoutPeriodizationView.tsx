import { useState, useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, MoreVertical, Pencil, Check } from "lucide-react";

/* ---------- Tipos ---------- */
interface Exercise {
  name: string;
  sets?: string;
  reps?: string;
  cadence?: string;
  rest?: string;
  notes?: string;
}
interface WorkoutDay {
  key: string;
  focus?: string;
  exercises?: Exercise[];
}
interface WeekMeta {
  label: string;
  sets: string;
  reps: string;
  rest: string;
  cadence: string;
}

/* ---------- Defaults de Periodização ---------- */
const DEFAULT_WEEKS: WeekMeta[] = [
  { label: "Semana 1", sets: "4 a 5 séries", reps: "5 a 8 reps", rest: "120s", cadence: "Excêntrica 2s" },
  { label: "Semana 2", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "—" },
  { label: "Semana 3", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "—" },
  { label: "Semana 4", sets: "2 a 4 séries", reps: "15 a 20 reps", rest: "30-45s", cadence: "1s / 1s" },
];

const BANNER_TEXT =
  "A falha mecânica total ou o uso de técnicas avançadas é restrito a exatamente 1 exercício por sessão. Os demais exercícios do bloco operar de 1 a 2 repetições na reserva (RIR), priorizando o controle motor e a estabilidade da cadência.";

/* ---------- Props ---------- */
interface Props {
  workouts: WorkoutDay[];
  /** Render fallback (visão legada). Mantém a UI atual intacta quando periodização está OFF. */
  renderLegacy: () => React.ReactNode;
  /** Permite alternar para Modo Edição (coach). */
  allowEdit?: boolean;
  /** Periodização vinda do payload do protocolo (definida pelo coach). */
  periodization?: {
    enabled?: boolean;
    weeks?: WeekMeta[];
    overrides?: Record<string, Record<string, Partial<Exercise>>>;
  };
}

type Overrides = Record<number, Record<string, Partial<Exercise>>>; // weekIdx → exId → fields

function exId(day: WorkoutDay, idx: number) {
  return `${day.key}_${idx}`;
}

export default function WorkoutPeriodizationView({ workouts, renderLegacy, allowEdit = false, periodization }: Props) {
  // Resolve dados da periodização vindos do payload (com fallback para defaults).
  const incomingWeeks = (periodization?.weeks && periodization.weeks.length === 4)
    ? periodization.weeks
    : DEFAULT_WEEKS;
  const incomingOverrides: Overrides = {};
  if (periodization?.overrides) {
    for (const [k, v] of Object.entries(periodization.overrides)) {
      const idx = Number(k);
      if (!Number.isNaN(idx)) incomingOverrides[idx] = v as Record<string, Partial<Exercise>>;
    }
  }
  // Aluno: sempre que o coach ativou a periodização, exibe periodizada.
  const initialOn = allowEdit ? !!periodization?.enabled : (periodization?.enabled ?? true);
  const [periodizationOn, setPeriodizationOn] = useState(initialOn);
  const [activeWeek, setActiveWeek] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [weeks, setWeeks] = useState<WeekMeta[]>(incomingWeeks);
  const [overrides, setOverrides] = useState<Overrides>(incomingOverrides);

  const currentWeek = weeks[activeWeek];

  const updateWeek = (field: keyof WeekMeta, value: string) => {
    setWeeks((prev) => prev.map((w, i) => (i === activeWeek ? { ...w, [field]: value } : w)));
  };

  const setOverride = (weekIdx: number, exerciseId: string, patch: Partial<Exercise>) => {
    setOverrides((prev) => ({
      ...prev,
      [weekIdx]: { ...(prev[weekIdx] || {}), [exerciseId]: { ...(prev[weekIdx]?.[exerciseId] || {}), ...patch } },
    }));
  };

  const resolvedExercises = useMemo(() => {
    const wkOverrides = overrides[activeWeek] || {};
    return workouts.map((day) => ({
      ...day,
      exercises: (day.exercises || []).map((ex, idx) => {
        const id = exId(day, idx);
        return { ...ex, ...(wkOverrides[id] || {}), __id: id } as Exercise & { __id: string };
      }),
    }));
  }, [workouts, overrides, activeWeek]);

  return (
    <div className="space-y-4">
      {/* Controles superiores — apenas coach vê o toggle e modo edição */}
      {allowEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3">
            <Switch checked={periodizationOn} onCheckedChange={setPeriodizationOn} id="periodization-toggle" />
            <Label htmlFor="periodization-toggle" className="text-sm font-semibold cursor-pointer">
              Ativar Periodização
            </Label>
          </div>
          {periodizationOn && (
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <><Check className="w-4 h-4 mr-1" />Concluir</> : <><Pencil className="w-4 h-4 mr-1" />Modo Edição</>}
            </Button>
          )}
        </div>
      )}

      {/* Renderização legada (intacta) — apenas quando o toggle está OFF e o coach tem controle */}
      {allowEdit && !periodizationOn && renderLegacy()}

      {/* Visão Periodizada */}
      {periodizationOn && (
        <>
          {/* Abas de semanas */}
          <div className="grid grid-cols-4 gap-2">
            {weeks.map((w, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveWeek(i)}
                className={`px-2 py-2 rounded-lg text-xs font-bold border transition ${
                  activeWeek === i
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted/50"
                }`}
              >
                {editMode ? (
                  <Input
                    value={w.label}
                    onChange={(e) => updateWeek("label", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 text-xs bg-background text-foreground"
                  />
                ) : (
                  w.label
                )}
              </button>
            ))}
          </div>

          {/* Metadados da semana ativa */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
            {(["sets", "reps", "rest", "cadence"] as const).map((k) => (
              <div key={k} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {k === "sets" ? "Séries" : k === "reps" ? "Reps" : k === "rest" ? "Descanso" : "Cadência"}
                </p>
                {editMode ? (
                  <Input
                    value={currentWeek[k]}
                    onChange={(e) => updateWeek(k, e.target.value)}
                    className="h-8 text-xs text-center"
                  />
                ) : (
                  <p className="font-semibold text-sm text-foreground">{currentWeek[k]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Banner fixo de observação */}
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs leading-relaxed text-foreground/90">
              {BANNER_TEXT}
            </AlertDescription>
          </Alert>

          {/* Exercícios (com override por semana) */}
          {workouts.length === 0 ? (
            <p className="text-center text-muted-foreground italic py-10">Nenhum exercício publicado.</p>
          ) : (
            <Accordion type="single" collapsible className="w-full space-y-3">
              {resolvedExercises.map((day, i) => (
                <AccordionItem
                  key={i}
                  value={`pw-${i}`}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black">
                        {day.key}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">Treino {day.key}</h3>
                        <p className="text-[11px] text-muted-foreground">{day.focus || "Geral"}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 border-t border-border/40 space-y-3 pt-3">
                    {(day.exercises as (Exercise & { __id: string })[]).map((ex, idx) => (
                      <ExerciseRow
                        key={ex.__id}
                        exercise={ex}
                        editMode={editMode}
                        onPatch={(patch) => setOverride(activeWeek, ex.__id, patch)}
                      />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Linha do exercício ---------- */
function ExerciseRow({
  exercise,
  editMode,
  onPatch,
}: {
  exercise: Exercise;
  editMode: boolean;
  onPatch: (p: Partial<Exercise>) => void;
}) {
  return (
    <div className="bg-background border border-border/50 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        {editMode ? (
          <Input
            value={exercise.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            className="h-8 text-sm font-bold"
          />
        ) : (
          <h4 className="font-bold text-sm text-primary flex-1">• {exercise.name}</h4>
        )}
        {editMode && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" className="w-56 p-2 space-y-1">
              <p className="text-[11px] text-muted-foreground px-2 pb-1">Override apenas nesta semana</p>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => {
                  const replacement = window.prompt("Novo nome do exercício:", exercise.name);
                  if (replacement) onPatch({ name: replacement });
                }}
              >
                Substituir exercício
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => onPatch({ notes: window.prompt("Observação:", exercise.notes || "") || "" })}
              >
                Adicionar observação
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(["sets", "reps", "cadence", "rest"] as const).map((k) => (
          <div key={k} className="bg-muted/50 p-2 rounded text-center">
            <p className="text-[10px] text-muted-foreground uppercase">
              {k === "sets" ? "Séries" : k === "reps" ? "Reps" : k === "cadence" ? "Cadência" : "Descanso"}
            </p>
            {editMode ? (
              <Input
                value={(exercise as any)[k] || ""}
                onChange={(e) => onPatch({ [k]: e.target.value } as Partial<Exercise>)}
                className="h-7 text-xs text-center mt-1"
              />
            ) : (
              <p className="font-semibold text-sm">{(exercise as any)[k] || "-"}</p>
            )}
          </div>
        ))}
      </div>
      {exercise.notes && !editMode && (
        <p className="text-xs text-muted-foreground mt-2 italic bg-muted/30 p-2 rounded border-l-2 border-primary/50">
          {exercise.notes}
        </p>
      )}
    </div>
  );
}