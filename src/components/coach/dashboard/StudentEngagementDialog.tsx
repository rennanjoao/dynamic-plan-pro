import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sb } from "@/integrations/supabase/untyped";
import { Private } from "@/components/coach/PrivacyMode";
import { formatDateTimePtBR } from "@/lib/formatDate";
import { daysAgo, dueLabel, formatDuration, lastActivityLabel } from "@/lib/engagementFormat";

interface Engagement {
  link_created_at: string | null;
  first_protocol_viewed_at: string | null;
  checkins_current_link: number;
  checkins_total: number;
  last_workout_at: string | null;
  last_diet_at: string | null;
  last_supplements_at: string | null;
  plan: { name: string; status: string; started_on: string; ends_on: string | null; next_due_date: string | null } | null;
  areas_30d: { area: string; total_seconds: number; session_count: number }[];
  opens_total: number;
  opens_7d: number;
  opens_30d: number;
  active_days_7d: number;
  active_days_30d: number;
  logins_total: number;
  tracking_since: string | null;
}

const AREA_LABEL: Record<string, string> = {
  treino: "Treino", dieta: "Dieta", suplementos: "Suplementos",
  evolucao: "Evolução", area_aluno: "Área do Aluno", outros: "Outros",
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export function StudentEngagementDialog({ student, open, onClose }: {
  student: StudentStatus | null; open: boolean; onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-engagement", student?.id],
    enabled: open && !!student,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_student_engagement", { p_student_id: student!.id });
      if (error) throw error;
      return data as Engagement;
    },
  });

  const activeStart = data?.plan?.started_on || data?.link_created_at || null;
  const activeDays = daysAgo(activeStart);
  const topArea = data?.areas_30d?.[0];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Engajamento — <Private>{student?.name ?? "Aluno"}</Private></DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground text-center py-8">Não foi possível carregar as métricas.</p>
        ) : (
          <div className="space-y-3">
            <Block title="Plano">
              <Row label="Primeiro protocolo aberto" value={data.first_protocol_viewed_at ? formatDateTimePtBR(data.first_protocol_viewed_at) : "Ainda não abriu"} />
              <Row label="Ativo há" value={activeDays === null ? "Sem dados" : `${activeDays} dias · desde ${new Date(`${activeStart!.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")}`} />
              <Row label="Vencimento" value={dueLabel(data.plan)} />
              {data.plan && <Row label="Plano" value={data.plan.name} />}
            </Block>
            <Block title="Check-ins">
              <Row label="Neste vínculo" value={data.checkins_current_link} />
              <Row label="Total histórico" value={data.checkins_total} />
            </Block>
            <Block title="Última atividade">
              <Row label="Treino" value={lastActivityLabel(data.last_workout_at)} />
              <Row label="Dieta" value={lastActivityLabel(data.last_diet_at)} />
              <Row label="Suplementos" value={lastActivityLabel(data.last_supplements_at)} />
            </Block>
            <Block title="Uso do app — últimos 30 dias">
              <Row label="Área mais usada" value={topArea ? `${AREA_LABEL[topArea.area] ?? topArea.area} · ${formatDuration(topArea.total_seconds)}` : "Sem dados suficientes"} />
              <Row label="Aberturas" value={`${data.opens_total} no total · ${data.opens_7d} em 7 dias · ${data.opens_30d} em 30 dias`} />
              <Row label="Dias ativos" value={`${data.active_days_7d} de 7 · ${data.active_days_30d} de 30`} />
              <p className="text-[11px] text-muted-foreground pt-1">
                {data.tracking_since
                  ? `Tempo por área medido desde ${new Date(data.tracking_since).toLocaleDateString("pt-BR")}.`
                  : "O tempo por área começa a ser medido quando o aluno usar o app após esta atualização."}
              </p>
            </Block>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default StudentEngagementDialog;
