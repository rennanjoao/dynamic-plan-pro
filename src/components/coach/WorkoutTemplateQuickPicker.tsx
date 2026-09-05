// WorkoutTemplateQuickPicker — fluxo rápido de treino, direto na aba de
// Workouts: aplicar/salvar um bloco de treino em 1-2 cliques. Wrapper fino
// sobre SectionTemplateQuickPicker (casca compartilhada com Dieta e
// Periodização) com a lógica e as strings específicas de treino.
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import {
  listWorkoutBlockTemplates,
  saveWorkoutBlockAsTemplate,
  injectWorkoutBlock,
  type WorkoutBlockTemplate,
} from "@/lib/workoutTemplates";
import { SectionTemplateQuickPicker } from "./SectionTemplateQuickPicker";
import { formatDatePtBR } from "@/lib/formatDate";

export function WorkoutTemplateQuickPicker({
  payload,
  setPayload,
  coachId,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
}) {
  const confirm = useConfirm();

  /** @returns `false` se o coach cancelou a confirmação (mantém o popover aberto). */
  async function applyTemplate(tpl: WorkoutBlockTemplate, mode: "filled" | "empty") {
    const hasContent = payload.workouts.some((d) => d.exercises.length > 0);
    if (hasContent && !(await confirm({
      title: "Substituir dias de treino",
      description: "Os dias de treino atuais serão substituídos pelos do template. Dieta, macros, suplementos e diretrizes não são afetados. Continuar?",
      confirmLabel: "Aplicar",
    }))) return false;
    setPayload(injectWorkoutBlock(payload, tpl.payload, mode));
    toast.success(mode === "filled" ? `"${tpl.name}" aplicado` : `Estrutura de "${tpl.name}" aplicada`);
  }

  const canSave = payload.workouts.some((d) => d.exercises.length > 0);

  return (
    <SectionTemplateQuickPicker<WorkoutBlockTemplate>
      coachId={coachId}
      applyLabel="Aplicar treino"
      applyPlaceholder="Buscar template de treino..."
      emptyLabel="Nenhum template encontrado."
      loadItems={listWorkoutBlockTemplates}
      onApply={(tpl) => applyTemplate(tpl, "filled")}
      searchValue={(tpl) => `${tpl.name} ${tpl.division ?? ""} ${tpl.profile ?? ""}`}
      secondaryAction={{
        title: "Aplicar só a estrutura, sem exercícios",
        label: "só estrutura",
        onSelect: (tpl) => applyTemplate(tpl, "empty"),
      }}
      canSave={canSave}
      saveLabel="Salvar treino"
      savingHint="Salvar dias de treino atuais como template"
      defaultSaveName={() => `Treino ${formatDatePtBR(new Date())}`}
      onSave={({ name, existingId }) =>
        saveWorkoutBlockAsTemplate({
          coachId: coachId as string,
          name,
          workouts: payload.workouts,
          periodization: payload.periodization?.enabled ? payload.periodization : undefined,
          existingId,
        })
      }
    />
  );
}
