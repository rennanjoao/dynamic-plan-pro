// DietBlockHistoryDialog — wrapper fino sobre BlockHistoryDialog (casca
// compartilhada com Treino e Periodização) preso às funções de dieta.
import {
  listDietBlockVersions, restoreDietBlockVersion, type DietBlockVersion,
} from "@/lib/dietTemplates";
import { BlockHistoryDialog } from "./BlockHistoryDialog";

export function DietBlockHistoryDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateName: string;
  coachId: string;
  onRestored: () => void;
}) {
  return (
    <BlockHistoryDialog<DietBlockVersion>
      {...props}
      listVersions={listDietBlockVersions}
      restoreVersion={restoreDietBlockVersion}
    />
  );
}

