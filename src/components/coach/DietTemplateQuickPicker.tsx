// DietTemplateQuickPicker — fluxo rápido de dieta, direto na aba Dieta:
// aplicar/salvar a lista de refeições em 1-2 cliques. Mesma casca de
// WorkoutTemplateQuickPicker (SectionTemplateQuickPicker), com a lógica e as
// strings de dieta.
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import {
  listDietBlockTemplates,
  saveDietBlockAsTemplate,
  injectDietBlock,
  type DietBlockTemplate,
} from "@/lib/dietTemplates";
import { SectionTemplateQuickPicker } from "./SectionTemplateQuickPicker";

export function DietTemplateQuickPicker({
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
  async function applyTemplate(tpl: DietBlockTemplate) {
    const hasContent = payload.meals.length > 0;
    if (hasContent && !(await confirm({
      title: "Substituir refeições",
      description: "As refeições atuais serão substituídas pelas do template. Treino, macros, suplementos, periodização e diretrizes não são afetados. Continuar?",
      confirmLabel: "Aplicar",
    }))) return false;
    setPayload(injectDietBlock(payload, tpl.payload));
    toast.success(`"${tpl.name}" aplicado`);
  }

  const canSave = payload.meals.length > 0;

  return (
    <SectionTemplateQuickPicker<DietBlockTemplate>
      coachId={coachId}
      applyLabel="Aplicar dieta"
      applyPlaceholder="Buscar template de dieta..."
      emptyLabel="Nenhum template encontrado."
      loadItems={listDietBlockTemplates}
      onApply={applyTemplate}
      canSave={canSave}
      saveLabel="Salvar dieta"
      savingHint="Salvar refeições atuais como template"
      defaultSaveName={() => `Dieta ${new Date().toLocaleDateString("pt-BR")}`}
      onSave={({ name, existingId }) =>
        saveDietBlockAsTemplate({
          coachId: coachId as string,
          name,
          meals: payload.meals,
          existingId,
        })
      }
    />
  );
}

