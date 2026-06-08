import { CheckCircle2, Circle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface WorkoutExercise {
  name: string;
  sets?: string;
  reps?: string;
  cadence?: string;
  rest?: string;
  notes?: string;
}

interface Workout {
  id: string;
  nome: string;
  exercicios?: Array<WorkoutExercise | string>;
}

interface WorkoutCardProps {
  workout: Workout;
  completed: boolean;
  onToggle: (id: string) => void;
}

const TERMS: Record<string, { label: string; desc: string }> = {
  sets:    { label: "Série",       desc: "Conjunto de repetições executadas sem pausa." },
  reps:    { label: "Repetições",  desc: "Quantidade de vezes que executa o movimento em cada série." },
  cadence: { label: "Cadência",    desc: "Velocidade de execução. Ex: 3-1-2 = 3s descendo, 1s pausa, 2s subindo." },
  rest:    { label: "Descanso",    desc: "Tempo de recuperação entre séries. Respeite para manter qualidade." },
  notes:   { label: "Observações", desc: "Anotações técnicas do coach específicas para o exercício." },
};

function InfoBadge({ termKey }: { termKey: keyof typeof TERMS }) {
  const t = TERMS[termKey];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-primary inline-flex" aria-label={t.label}>
          <Info size={14} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-[220px] p-3">
        <p className="text-xs font-bold mb-1">{t.label}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{t.desc}</p>
      </PopoverContent>
    </Popover>
  );
}

function ColHeader({ label, k }: { label: string; k: keyof typeof TERMS }) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
      {label} <InfoBadge termKey={k} />
    </span>
  );
}

export const WorkoutCard = ({ workout, completed, onToggle }: WorkoutCardProps) => {
  const exercises = (workout.exercicios || []).map((e) =>
    typeof e === "string" ? ({ name: e } as WorkoutExercise) : e,
  );

  return (
    <Card className="p-5 shadow-sm card-hover glass-strong space-y-4">
      <div className="flex justify-between items-start gap-4">
        <h3 className="text-xl font-semibold text-foreground">{workout.nome}</h3>
        <Button onClick={() => onToggle(workout.id)} variant={completed ? "default" : "outline"} size="sm" className="shrink-0">
          {completed ? <><CheckCircle2 className="w-4 h-4 mr-2" />Concluído</> : <><Circle className="w-4 h-4 mr-2" />Marcar</>}
        </Button>
      </div>

      {/* Cabeçalho de colunas */}
      <div className="grid grid-cols-[1.5fr_repeat(5,minmax(0,1fr))] gap-2 px-2 pb-2 border-b border-border/40">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Exercício</span>
        <ColHeader label="Série"      k="sets" />
        <ColHeader label="Repetições" k="reps" />
        <ColHeader label="Cadência"   k="cadence" />
        <ColHeader label="Descanso"   k="rest" />
        <ColHeader label="Obs"        k="notes" />
      </div>

      <ul className="space-y-2">
        {exercises.map((ex, i) => (
          <li key={i} className="grid grid-cols-[1.5fr_repeat(5,minmax(0,1fr))] gap-2 items-center text-sm px-2 py-1.5 rounded hover:bg-muted/30">
            <span className="font-medium text-foreground truncate">{ex.name}</span>
            <span className="text-xs tabular-nums">{ex.sets || "-"}</span>
            <span className="text-xs tabular-nums">{ex.reps || "-"}</span>
            <span className="text-xs tabular-nums">{ex.cadence || "-"}</span>
            <span className="text-xs tabular-nums">{ex.rest || "-"}</span>
            <span className="text-xs text-muted-foreground truncate" title={ex.notes}>{ex.notes || "-"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
};
