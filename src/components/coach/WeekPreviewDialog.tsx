import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { resolveExerciseForWeek } from "@/lib/periodizationValidation";
import type { ProtocolPayload } from "@/lib/protocolSchema";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: ProtocolPayload;
  weekIndex: number | null;
}

export default function WeekPreviewDialog({ open, onOpenChange, payload, weekIndex }: Props) {
  if (weekIndex == null) return null;
  const meta = payload.periodization.weeks[weekIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Prévia — {meta?.label || `Semana ${weekIndex + 1}`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Visualização exata do que o aluno verá nesta semana, com overrides aplicados.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-background/40 p-3 mb-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><span className="text-muted-foreground">Séries:</span> <b>{meta.sets || "—"}</b></div>
          <div><span className="text-muted-foreground">Reps:</span> <b>{meta.reps || "—"}</b></div>
          <div><span className="text-muted-foreground">Descanso:</span> <b>{meta.rest || "—"}</b></div>
          <div><span className="text-muted-foreground">Cadência:</span> <b>{meta.cadence || "—"}</b></div>
        </div>

        {payload.workouts.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-6 text-center">
            Sem exercícios cadastrados na aba Treino.
          </p>
        )}

        <div className="space-y-3">
          {payload.workouts.map((day) => (
            <div key={day.key} className="rounded-lg border border-border/60 bg-background/30 p-3">
              <p className="text-[11px] font-bold uppercase text-primary mb-2">
                Treino {day.key} {day.focus ? `— ${day.focus}` : ""}
              </p>
              <div className="space-y-1">
                {day.exercises.map((_, ei) => {
                  const r = resolveExerciseForWeek(payload, weekIndex, day.key, ei);
                  if (!r) return null;
                  return (
                    <div key={ei} className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-2 text-xs items-center py-1 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{r.name || <em className="text-muted-foreground">(sem nome)</em>}</span>
                        {r.overridden && <Badge variant="secondary" className="text-[9px] h-4">override</Badge>}
                      </div>
                      <span className="text-muted-foreground">{r.sets || "—"}</span>
                      <span className="text-muted-foreground">{r.reps || "—"}</span>
                      <span className="text-muted-foreground">{r.cadence || "—"}</span>
                      <span className="text-muted-foreground">{r.rest || "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}