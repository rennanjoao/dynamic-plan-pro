/**
 * ProtocolChangeHistoryDialog.tsx
 *
 * Somente leitura. Lista TODAS as linhas de `protocol_change_events` do aluno
 * selecionado, ordenadas do mais recente para o mais antigo (limit 50). Cada
 * linha mostra data/hora, se já foi visto pelo aluno, e a lista de mudanças
 * (`changes`) com ícone por categoria, label e detail.
 *
 * O coach NÃO marca nada como visto aqui — isso é papel exclusivo do aluno
 * via CoachUpdatesCard.tsx.
 */
import { useQuery } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { StudentLite, StudentStatus } from "@/hooks/useCoachStudents";
import {
  Sparkles, Dumbbell, Apple, Pill, ClipboardList, Loader2,
} from "lucide-react";
import { Private } from "@/components/coach/PrivacyMode";
import { formatDateTimePtBR } from "@/lib/formatDate";

interface ChangeItem {
  category: "treino" | "dieta" | "suplemento" | "diretriz" | "geral";
  importance: "alta" | "media" | "baixa";
  label: string;
  target_tab: "treino" | "dieta" | "suplementos" | null;
  target_anchor: string | null;
  detail: string | null;
}

interface EventRow {
  id: string;
  changes: ChangeItem[];
  seen_at: string | null;
  created_at: string;
}

function iconForCategory(cat: ChangeItem["category"]) {
  switch (cat) {
    case "treino": return Dumbbell;
    case "dieta": return Apple;
    case "suplemento": return Pill;
    case "diretriz": return ClipboardList;
    default: return Sparkles;
  }
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  return formatDateTimePtBR(iso);
}

export default function ProtocolChangeHistoryDialog({
  student, open, onClose,
}: {
  student: StudentStatus | StudentLite | null;
  open: boolean;
  onClose: () => void;
}) {
  const studentId = student?.id ?? null;
  const studentName = student?.name ?? "Aluno";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["coach-protocol-change-history", studentId],
    enabled: !!studentId && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("protocol_change_events")
        .select("id, changes, seen_at, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as EventRow[] | null) ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Alterações — <Private>{studentName}</Private></DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Nenhuma alteração de protocolo registrada para este aluno ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const changes = Array.isArray(row.changes) ? row.changes : [];
              return (
                <div key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">
                      {fmt(row.created_at)}
                    </p>
                    {row.seen_at ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Visto pelo aluno em {fmt(row.seen_at)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        Ainda não visto pelo aluno
                      </span>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {changes.map((item, idx) => {
                      const Icon = iconForCategory(item.category);
                      return (
                        <li key={idx} className="flex gap-3 p-2.5 rounded-lg bg-accent/30">
                          <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm text-foreground">{item.label}</p>
                            {item.detail && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {item.detail}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
