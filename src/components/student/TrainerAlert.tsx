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
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, X, ChevronRight } from "lucide-react";

// ─── Componente ───────────────────────────────────────────────────────────────
export const TrainerAlert = ({ coachName }: { coachName?: string | null }) => {
  const { studentId } = useStudentData();

  // Usa o primeiro nome real do coach quando disponível.
  const firstName = (coachName || "").trim().split(/\s+/)[0] || "";
  const alertLabel = firstName ? `Mensagem de ${firstName}` : "Mensagem do Treinador";

  const [alertData, setAlertData] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // Busca alerta do coach no banco
  useEffect(() => {
    if (!studentId) return;

    const fetchAlert = async () => {
      const { data } = await supabase
        .from("daily_alerts")
        .select("id, message, frequency, target_date, created_at, read_at")
        .eq("student_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!data || data.length === 0) {
        setAlertData(null);
        return;
      }

      const alert = data[0];

      // Já lido (marcado no servidor) — não mostra de novo, em nenhum aparelho.
      if (alert.read_at) {
        setAlertData(null);
        return;
      }

      const today = new Date();
      const todayString = today.toISOString().split("T")[0];
      const currentDay = today.getDay();

      let shouldShow = false;

      if (alert.frequency === "daily") {
        shouldShow = true;
      } else if (alert.frequency === "weekly" && currentDay === 1) {
        shouldShow = true;
      } else if (alert.frequency === "once") {
        const createdAt = alert.created_at
          ? new Date(alert.created_at)
          : alert.target_date
          ? new Date(alert.target_date)
          : null;

        if (createdAt) {
          const daysSince = Math.floor(
            (today.getTime() - createdAt.getTime()) / 86_400_000
          );
          if (daysSince >= 0 && daysSince <= 7) {
            shouldShow = true;
          }
        } else {
          shouldShow = alert.target_date === todayString;
        }
      }

      setAlertData(shouldShow ? { id: alert.id, message: alert.message } : null);
    };

    fetchAlert();

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
        () => fetchAlert()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  // ─── Dismiss do alerta do coach — grava no servidor, não no navegador ──────
  const handleDismissMessage = async () => {
    if (!alertData || dismissing) return;
    setDismissing(true);
    const id = alertData.id;
    setAlertData(null); // resposta imediata na UI, não espera a rede
    const { error } = await (supabase as any).rpc("mark_daily_alert_read", { p_alert_id: id });
    if (error) console.warn("mark_daily_alert_read falhou", error);
    setDismissing(false);
  };

  const messageVisible = alertData !== null;

  if (!messageVisible) return null;

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
      {messageVisible && (
        <>
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
                className="font-bold tracking-wide mb-1"
                style={{ color: "hsl(145, 63%, 49%)" }}
              >
                {alertLabel}
              </AlertTitle>
              <AlertDescription
                className="mt-1 text-sm break-words line-clamp-1"
                style={{ color: "hsla(145, 63%, 90%, 0.8)" }}
              >
                "{alertData!.message}"
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
                "{alertData!.message}"
              </p>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
};
