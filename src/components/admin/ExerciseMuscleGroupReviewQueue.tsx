import { useEffect, useState } from "react";
import { sb } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type MuscleGroup,
} from "@/lib/muscleGroupClassifier";

interface Row {
  exercise_key: string;
  display_name: string | null;
}

/**
 * Fila de revisão dos exercícios que ficaram sem classificação de grupo
 * muscular — seja porque o classificador automático não bateu no nome, ou
 * porque o coach clicou "Pular" no prompt inline do ExercisePickerInput.
 * Nenhuma outra parte do app depende desta tela; ela existe só para o
 * admin fechar as pontas soltas em lote.
 */
export function ExerciseMuscleGroupReviewQueue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("exercise_library")
      .select("exercise_key, display_name")
      .eq("classification_source", "unclassified")
      .order("display_name", { ascending: true });
    if (error) {
      toast.error(`Falha ao carregar fila: ${error.message}`);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const assign = async (exerciseKey: string, group: MuscleGroup) => {
    setSaving(exerciseKey);
    const { error } = await sb
      .from("exercise_library")
      .update({
        primary_muscle_group: group,
        secondary_muscle_groups: [],
        classification_source: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("exercise_key", exerciseKey);
    setSaving(null);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    setRows((r) => r.filter((x) => x.exercise_key !== exerciseKey));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando fila…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Nenhum exercício pendente de classificação. 🎉
        </p>
        <Button variant="outline" size="sm" onClick={load}>Recarregar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} exercício{rows.length === 1 ? "" : "s"} sem grupo muscular definido.
        </p>
        <Button variant="outline" size="sm" onClick={load}>Recarregar</Button>
      </div>
      <div className="rounded-lg border border-border divide-y divide-border">
        {rows.map((row) => (
          <div key={row.exercise_key} className="flex items-center gap-3 p-3">
            <span className="flex-1 text-sm truncate">
              {row.display_name ?? row.exercise_key.replace(/_/g, " ")}
            </span>
            <select
              disabled={saving === row.exercise_key}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value as MuscleGroup | "";
                if (v) assign(row.exercise_key, v);
              }}
              className="h-8 text-base md:text-xs rounded border border-border bg-background px-2"
            >
              <option value="" disabled>Selecionar grupo…</option>
              {MUSCLE_GROUP_OPTIONS.map((g) => (
                <option key={g} value={g}>{MUSCLE_GROUP_LABELS[g]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
