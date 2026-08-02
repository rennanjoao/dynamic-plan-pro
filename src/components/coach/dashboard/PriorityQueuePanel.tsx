/**
 * PriorityQueuePanel.tsx — Fila única de prioridade do dia (F3 do Master
 * Blueprint). Lê a view `coach_priority_queue`, que hoje cruza apenas
 * fontes sobre ALUNOS: coach_fatigue_alerts ('fatigue') e check-ins com
 * pedido de atenção prioritária ainda sem feedback ('checkin_urgent').
 * A cobrança da plataforma saiu daqui — vive no Perfil / aba Financeiro.
 * 100% leitura — nenhuma escrita acontece aqui.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, LifeBuoy, ListChecks } from "lucide-react";
import type { StudentLite } from "@/hooks/useCoachStudents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

type QueueSeverity = "critical" | "warning" | "info";
type QueueSource = "fatigue" | "checkin_urgent";

interface QueueRow {
  source_id: string;
  coach_id: string;
  student_id: string | null;
  source: QueueSource;
  severity: QueueSeverity;
  title: string;
  message: string;
  suggested_action: string | null;
  reference_at: string;
}

interface Props {
  coachId: string;
  students: StudentLite[];
  onSelectStudent?: (studentId: string, source: QueueSource) => void;
}

const SEVERITY_RANK: Record<QueueSeverity, number> = { critical: 0, warning: 1, info: 2 };

const SOURCE_ICON: Record<QueueSource, typeof AlertTriangle> = {
  fatigue: AlertTriangle,
  checkin_urgent: LifeBuoy,
};

export function PriorityQueuePanel({ coachId, students, onSelectStudent }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["coach-priority-queue", coachId],
    enabled: !!coachId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("coach_priority_queue")
        .select("source_id, coach_id, student_id, source, severity, title, message, suggested_action, reference_at")
        .eq("coach_id", coachId);
      if (error) throw error;
      return (data as QueueRow[]) ?? [];
    },
  });

  if (isLoading) return null;

  const rows = [...(data ?? [])].sort((a, b) => {
    const diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (diff !== 0) return diff;
    return new Date(b.reference_at).getTime() - new Date(a.reference_at).getTime();
  });

  if (rows.length === 0) return null;

  const nameById = new Map(students.map((s) => [s.id, s.name]));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <ListChecks className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold text-foreground">Fila de prioridade do dia</p>
        <span className="text-xs text-muted-foreground ml-auto">{rows.length}</span>
      </div>
      <div className="divide-y divide-border max-h-80 overflow-y-auto">
        {rows.map((r) => {
          const Icon = SOURCE_ICON[r.source] ?? AlertTriangle;
          const sevCls =
            r.severity === "critical" ? "text-red-500" :
            r.severity === "warning" ? "text-amber-500" :
            "text-sky-500";
          const studentName = r.student_id ? nameById.get(r.student_id) : undefined;
          const clickable = !!r.student_id && !!onSelectStudent;
          return (
            <button
              key={r.source_id}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (r.student_id && onSelectStudent) onSelectStudent(r.student_id, r.source);
              }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                clickable ? "hover:bg-accent/50 cursor-pointer" : "cursor-default"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${sevCls}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-foreground">{r.title}</p>
                  {studentName && <Private className="text-xs text-muted-foreground">— {studentName}</Private>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.message}</p>
                {r.suggested_action && (
                  <p className="text-[11px] text-primary mt-1 font-medium">Sugestão: {r.suggested_action}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PriorityQueuePanel;
