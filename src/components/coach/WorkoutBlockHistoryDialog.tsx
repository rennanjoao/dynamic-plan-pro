// WorkoutBlockHistoryDialog — wrapper fino sobre BlockHistoryDialog (casca
// compartilhada com Dieta e Periodização) preso às funções de treino.
import {
  listWorkoutBlockVersions, restoreWorkoutBlockVersion, type WorkoutBlockVersion,
} from "@/lib/workoutTemplates";
import { BlockHistoryDialog } from "./BlockHistoryDialog";

export function WorkoutBlockHistoryDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateName: string;
  coachId: string;
  onRestored: () => void;
}) {
  return (
    <BlockHistoryDialog<WorkoutBlockVersion>
      {...props}
      listVersions={listWorkoutBlockVersions}
      restoreVersion={restoreWorkoutBlockVersion}
    />
  );
}

