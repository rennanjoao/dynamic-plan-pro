// PeriodizationBlockHistoryDialog — wrapper fino sobre BlockHistoryDialog
// (casca compartilhada com Treino e Dieta) preso às funções de
// periodização.
import {
  listPeriodizationBlockVersions, restorePeriodizationBlockVersion, type PeriodizationBlockVersion,
} from "@/lib/periodizationTemplates";
import { BlockHistoryDialog } from "./BlockHistoryDialog";

export function PeriodizationBlockHistoryDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateName: string;
  coachId: string;
  onRestored: () => void;
}) {
  return (
    <BlockHistoryDialog<PeriodizationBlockVersion>
      {...props}
      listVersions={listPeriodizationBlockVersions}
      restoreVersion={restorePeriodizationBlockVersion}
    />
  );
}

