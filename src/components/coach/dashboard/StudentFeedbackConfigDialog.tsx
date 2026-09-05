import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { sb } from "@/integrations/supabase/untyped";
import { Private } from "@/components/coach/PrivacyMode";

export function StudentFeedbackConfigDialog({
  student, coachId, open, onClose, onSaved,
}: {
  student: StudentStatus | null;
  coachId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [interval, setIntervalDays] = useState<number>(14);
  const [warning, setWarning] = useState<number>(14);
  const [critical, setCritical] = useState<number>(16);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && student) {
      setIntervalDays(student.feedbackIntervalDays ?? 14);
      setWarning(student.warningDays ?? 14);
      setCritical(student.criticalDays ?? 16);
    }
  }, [open, student]);

  const save = async () => {
    if (!student || !coachId) return;
    if (interval <= 0 || warning <= 0 || critical <= 0) {
      toast.error("Todos os valores devem ser maiores que zero");
      return;
    }
    if (critical < warning) {
      toast.error("Dias para Crítico deve ser maior ou igual a Atenção");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb
        .from("coach_students")
        .update({
          feedback_interval_days: interval,
          warning_days: warning,
          critical_days: critical,
        })
        .eq("coach_id", coachId)
        .eq("student_id", student.id);
      if (error) throw error;
      toast.success("Configuração de feedback atualizada");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback — <Private>{student?.name ?? "Aluno"}</Private></DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="fb-interval" className="text-xs">Intervalo de feedback (dias)</Label>
            <Input id="fb-interval" type="number" min={1} value={interval} onChange={(e) => setIntervalDays(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground">A cada quantos dias o aluno deve enviar check-in.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-warning" className="text-xs">Dias para Atenção</Label>
            <Input id="fb-warning" type="number" min={1} value={warning} onChange={(e) => setWarning(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground">A partir desse número, o aluno aparece em amarelo.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-critical" className="text-xs">Dias para Crítico</Label>
            <Input id="fb-critical" type="number" min={1} value={critical} onChange={(e) => setCritical(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground">A partir desse número, o aluno aparece em vermelho.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudentFeedbackConfigDialog;
