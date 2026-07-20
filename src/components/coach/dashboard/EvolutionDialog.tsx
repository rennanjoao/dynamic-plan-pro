import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EvolutionComparisonLazy = lazy(() => import("@/components/coach/EvolutionComparison"));
const AnamnesisViewerLazy = lazy(() => import("@/components/anamnesis/AnamnesisViewer"));

export function EvolutionDialog({ student, open, onClose }: { student: StudentStatus | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Evolução e Anamnese — {student?.name || "Aluno"}</DialogTitle>
        </DialogHeader>
        {student && (
          <Tabs defaultValue="evolucao" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="evolucao">Evolução</TabsTrigger>
              <TabsTrigger value="anamnese">Anamnese completa</TabsTrigger>
            </TabsList>
            <TabsContent value="evolucao" className="mt-4">
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                <EvolutionComparisonLazy studentId={student.id} studentName={student.name} />
              </Suspense>
            </TabsContent>
            <TabsContent value="anamnese" className="mt-4">
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                <AnamnesisViewerLazy studentId={student.id} studentName={student.name} />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EvolutionDialog;