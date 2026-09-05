// GuidelinesTemplateQuickPicker — aplicar/salvar as diretrizes atuais como
// template reutilizável em qualquer aluno. Mesma casca dos pickers de treino
// e dieta (SectionTemplateQuickPicker).
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import {
  listGuidelinesTemplates,
  saveGuidelinesAsTemplate,
  injectGuidelines,
  hasAnyGuideline,
  type GuidelinesTemplate,
} from "@/lib/guidelinesTemplates";
import { SectionTemplateQuickPicker } from "./SectionTemplateQuickPicker";
import { formatDatePtBR } from "@/lib/formatDate";

export function GuidelinesTemplateQuickPicker({
  payload,
  setPayload,
  coachId,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
}) {
  const confirm = useConfirm();

  async function applyTemplate(tpl: GuidelinesTemplate) {
    if (hasAnyGuideline(payload.guidelines) && !(await confirm({
      title: "Substituir diretrizes",
      description: "As diretrizes atuais (treino, dieta, semana e sono) serão substituídas pelas do template. Treino, dieta e suplementos não são afetados. Continuar?",
      confirmLabel: "Aplicar",
    }))) return false;
    setPayload(injectGuidelines(payload, tpl.payload));
    toast.success(`"${tpl.name}" aplicado`);
  }

  return (
    <SectionTemplateQuickPicker<GuidelinesTemplate>
      coachId={coachId}
      applyLabel="Aplicar diretrizes"
      applyPlaceholder="Buscar template de diretrizes..."
      emptyLabel="Nenhum template encontrado."
      loadItems={listGuidelinesTemplates}
      onApply={applyTemplate}
      canSave={hasAnyGuideline(payload.guidelines)}
      saveLabel="Salvar diretrizes"
      savingHint="Salvar diretrizes atuais como template"
      defaultSaveName={() => `Diretrizes ${formatDatePtBR(new Date())}`}
      onSave={({ name, existingId }) =>
        saveGuidelinesAsTemplate({
          coachId: coachId as string,
          name,
          guidelines: payload.guidelines,
          existingId,
        })
      }
    />
  );
}

export default GuidelinesTemplateQuickPicker;
