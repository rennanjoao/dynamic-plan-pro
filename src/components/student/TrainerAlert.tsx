/**
 * TrainerAlert.tsx
 *
 * CORREÇÕES DESTA VERSÃO:
 * - Botão X adicionado — aluno consegue fechar a mensagem do coach
 * - Dismiss persiste em localStorage por chave única (id + created_at do alerta)
 *   → Não volta ao recarregar a página
 * - Alert "once" continua exibindo por até 7 dias, mas agora o aluno controla
 * - Busca também o campo "id" da tabela daily_alerts para gerar a chave de dismiss
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, X, ChevronRight } from "lucide-react";

// ─── Persistência de dismiss ──────────────────────────────────────────────────
const TRAINER_DISMISSED_KEY = (uid: string) => `trainer_alert_dismissed_${uid}`;

function loadDismissedTrainer(uid: string): string[] {
  try {
    const raw = localStorage.getItem(TRAINER_DISMISSED_KEY(uid));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveDismissedTrainer(uid: string, keys: string[]) {
  try {
    localStorage.setItem(TRAINER_DISMISSED_KEY(uid), JSON.stringify(keys));
  } catch {
    /* noop */
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────
export const TrainerAlert = ({ coachName }: { coachName?: string | null }) => {
  const { studentId } = useStudentData();

  // Usa o primeiro nome real do coach quando disponível.
  const firstName = (coachName || "").trim().split(/\s+/)[0] || "";
  const alertLabel = firstName ? `Mensagem de ${firstName}` : "Mensagem do Treinador";

  const [alertData, setAlertData] = useState<{
    dismissKey: string;
    message: string;
  } | null>(null);

  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Carrega dismissed do localStorage assim que temos o studentId
  useEffect(() => {
    if (!studentId) return;
    setDismissed(loadDismissedTrainer(studentId));
  }, [studentId]);

  // Busca alerta do coach no banco
  useEffect(() => {
    if (!studentId) return;

    const fetchAlert = async () => {
      const { data } = await supabase
        .from("daily_alerts")
        .select("id, message, frequency, target_date, created_at")
        .eq("student_id", studentId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!data || data.length === 0) {
        setAlertData(null);
        return;
      }

      const alert = data[0];
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

      if (shouldShow) {
        // Chave única: combina id + created_at para que um novo alerta
        // do mesmo coach apareça mesmo que o anterior tenha sido dispensado
        const dismissKey = `trainer_${alert.id}_${alert.created_at ?? alert.target_date ?? ""}`;
        setAlertData({ dismissKey, message: alert.message });
      } else {
        setAlertData(null);
      }
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

  // ─── Dismiss do alerta do coach ────────────────────────────────────────────
  const handleDismissMessage = () => {
    if (!alertData || !studentId) return;
    const updated = [...dismissed, alertData.dismissKey];
    setDismissed(updated);
    saveDismissedTrainer(studentId, updated);
  };

  const messageVisible =
    alertData !== null && !dismissed.includes(alertData.dismissKey);

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
