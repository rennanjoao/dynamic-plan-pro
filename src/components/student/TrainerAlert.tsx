/**
 * TrainerAlert.tsx
 *
 * - Botão X fecha a mensagem do coach.
 * - Estado de "lido" é gravado no servidor (daily_alerts.read_at, via RPC
 *   mark_daily_alert_read) — não em localStorage. Antes, fechar a mensagem
 *   só marcava "lido" no navegador atual; trocar de aparelho ou limpar dados
 *   do navegador fazia o mesmo recado do coach reaparecer como se fosse novo.
 * - Alert "once" continua elegível a aparecer por até 7 dias após criado,
 *   mas só é exibido enquanto read_at ainda for nulo.
 * - FILA: se o coach enviar mais de uma mensagem (ex.: responde duas dúvidas
 *   no mesmo dia, ou feedback de check-in + uma resposta), todas ficam em
 *   fila — a mais antiga primeiro — em vez de só a mais recente aparecer e
 *   as outras sumirem sem o aluno nunca as ver. Um selo "+N" avisa quando
 *   há mais mensagens esperando atrás da que está em exibição.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, X, ChevronRight } from "lucide-react";

interface DailyAlertRow {
  id: string;
  message: string;
  frequency: string | null;
  target_date: string | null;
  created_at: string | null;
  read_at: string | null;
}

interface QueuedAlert {
  id: string;
  message: string;
}

/**
 * Decide se um daily_alert deve aparecer hoje, dada a frequência configurada
 * pelo coach. Extraído como função pura (antes vivia só dentro do fetch) para
 * poder ser aplicado a VÁRIAS linhas ao montar a fila, não só à mais recente.
 */
function shouldShowAlert(alert: DailyAlertRow, now: Date): boolean {
  if (alert.read_at) return false;

  if (alert.frequency === "daily") return true;
  if (alert.frequency === "weekly") return now.getDay() === 1;

  if (alert.frequency === "once") {
    const createdAt = alert.created_at
      ? new Date(alert.created_at)
      : alert.target_date
      ? new Date(alert.target_date)
      : null;

    if (createdAt) {
      const daysSince = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);
      return daysSince >= 0 && daysSince <= 7;
    }
    const todayString = now.toISOString().split("T")[0];
    return alert.target_date === todayString;
  }

  return false;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export const TrainerAlert = ({ coachName }: { coachName?: string | null }) => {
  const { studentId } = useStudentData();

  // Usa o primeiro nome real do coach quando disponível.
  const firstName = (coachName || "").trim().split(/\s+/)[0] || "";
  const alertLabel = firstName ? `Mensagem de ${firstName}` : "Mensagem do Treinador";

  const [queue, setQueue] = useState<QueuedAlert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // Busca a fila de alertas do coach no banco (mais antigo primeiro).
  useEffect(() => {
    if (!studentId) return;

    const fetchAlerts = async () => {
      const { data } = await supabase
        .from("daily_alerts")
        .select("id, message, frequency, target_date, created_at, read_at")
        .eq("student_id", studentId)
        .eq("is_active", true)
        .is("read_at", null)
        .order("created_at", { ascending: true })
        .limit(20);

      if (!data) {
        setQueue([]);
        return;
      }

      const now = new Date();
      const visible = (data as DailyAlertRow[])
        .filter((a) => shouldShowAlert(a, now))
        .map((a) => ({ id: a.id, message: a.message }));

      setQueue(visible);
    };

    fetchAlerts();

    const channel = supabase
      .channel("student-alerts-daily")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_alerts",
          filter: `student_id=eq.${studentId}`,
        },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  const current = queue[0] ?? null;
  if (!current) return null;

  const remaining = queue.length - 1;

  // ─── Dismiss do alerta em exibição — grava no servidor, não no navegador ──
  const handleDismissMessage = async () => {
    if (dismissing) return;
    setDismissing(true);
    const id = current.id;
    // Resposta imediata na UI, não espera a rede — e já revela a próxima
    // mensagem da fila (se houver) em vez de só fechar o card.
    setQueue((prev) => prev.slice(1));
    setExpanded(false);
    const { error } = await (supabase as any).rpc("mark_daily_alert_read", { p_alert_id: id });
    if (error) console.warn("mark_daily_alert_read falhou", error);
    setDismissing(false);
  };

  return (
    <>
      <style>
        {`
          @keyframes softPulse {
            0%, 100% { transform: translateY(0); box-shadow: 0 0 0 0 hsla(145, 63%, 50%, 0.35); }
            50% { transform: translateY(-1px); box-shadow: 0 0 0 6px hsla(145, 63%, 50%, 0); }
          }
          .animate-soft-pulse {
            animation: softPulse 2.2s ease-in-out infinite;
          }
        `}
      </style>

      {/* ── Mensagem do coach — prévia pequena, expande ao tocar ── */}
      <Alert
        className="mb-6 border backdrop-blur-md animate-fade-in-down relative cursor-pointer"
        style={{
          backgroundColor: "hsla(145, 63%, 42%, 0.1)",
          borderColor: "hsla(145, 63%, 42%, 0.2)",
        }}
        onClick={() => setExpanded(true)}
      >
        <Info className="h-5 w-5 absolute left-4 top-4" style={{ color: "hsl(145, 63%, 49%)" }} />
        {/* Botão fechar */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleDismissMessage(); }}
          className="absolute top-3 right-3 opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Fechar ${alertLabel.toLowerCase()}`}
          style={{ color: "hsl(145, 63%, 49%)" }}
        >
          <X className="w-4 h-4" />
        </button>
        {/* Wrapper: garante que [&>svg~*]:pl-7 se aplique uma única vez ao div,
            evitando sobreposição do ícone absoluto sobre o texto em mobile */}
        <div className="pl-7 pr-8">
          <AlertTitle
            className="font-bold tracking-wide mb-1 flex items-center gap-2"
            style={{ color: "hsl(145, 63%, 49%)" }}
          >
            {alertLabel}
            {remaining > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                style={{ backgroundColor: "hsla(145, 63%, 42%, 0.18)", color: "hsl(145, 63%, 49%)" }}
                title={`+${remaining} mensagem${remaining > 1 ? "s" : ""} após esta`}
              >
                +{remaining}
              </span>
            )}
          </AlertTitle>
          <AlertDescription
            className="mt-1 text-sm break-words line-clamp-1"
            style={{ color: "hsla(145, 63%, 90%, 0.8)" }}
          >
            "{current.message}"
          </AlertDescription>
          <div
            className="flex items-center gap-1 mt-1 text-[11px] font-medium"
            style={{ color: "hsl(145, 63%, 49%)" }}
          >
            Toque para ver completo <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </Alert>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2"
              style={{ color: "hsl(145, 63%, 42%)" }}
            >
              <Info className="w-4 h-4" /> {alertLabel}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
            "{current.message}"
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};
