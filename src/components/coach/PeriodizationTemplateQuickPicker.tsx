// PeriodizationTemplateQuickPicker — fluxo rápido de periodização, direto
// na aba Treinos (dentro do WorkoutPeriodizationEditor): aplicar/salvar o
// esquema de 4 semanas + overrides em 1-2 cliques. Mesma casca de
// WorkoutTemplateQuickPicker (SectionTemplateQuickPicker), com a lógica e as
// strings de periodização.
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import {
  listPeriodizationBlockTemplates,
  savePeriodizationBlockAsTemplate,
  injectPeriodizationBlock,
  type PeriodizationBlockTemplate,
} from "@/lib/periodizationTemplates";
import { SectionTemplateQuickPicker } from "./SectionTemplateQuickPicker";
import { formatDatePtBR } from "@/lib/formatDate";

export function PeriodizationTemplateQuickPicker({
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
  async function applyTemplate(tpl: PeriodizationBlockTemplate) {
    if (payload.periodization?.enabled && !(await confirm({
      title: "Substituir periodização",
      description: "O esquema de semanas e os overrides por exercício atuais serão substituídos pelos do template. Treino, dieta, macros e suplementos não são afetados. Continuar?",
      confirmLabel: "Aplicar",
    }))) return false;
    const { payload: next, applied, skipped } = injectPeriodizationBlock(payload, tpl.payload);
    setPayload(next);
    if (skipped > 0) {
      toast.success(
        `"${tpl.name}" aplicado — ${applied} ajuste(s) de exercício mantido(s), ${skipped} ignorado(s) por não corresponder a um exercício deste treino`,
      );
    } else {
      toast.success(`"${tpl.name}" aplicado`);
    }
  }

  const canSave = payload.periodization?.enabled === true;

  return (
    <SectionTemplateQuickPicker<PeriodizationBlockTemplate>
      coachId={coachId}
      applyLabel="Aplicar periodização"
      applyPlaceholder="Buscar template de periodização..."
      emptyLabel="Nenhum template encontrado."
      loadItems={listPeriodizationBlockTemplates}
      onApply={applyTemplate}
      canSave={canSave}
      saveLabel="Salvar periodização"
      savingHint={canSave ? "Salvar periodização atual como template" : "Ative a periodização antes de salvar"}
      defaultSaveName={() => `Periodização ${formatDatePtBR(new Date())}`}
      onSave={({ name, existingId }) =>
        savePeriodizationBlockAsTemplate({
          coachId: coachId as string,
          name,
          periodization: payload.periodization,
          existingId,
        })
      }
    />
  );
}
