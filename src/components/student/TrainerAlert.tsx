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

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Zap, X } from "lucide-react";

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
export const TrainerAlert = () => {
  const { protocol, studentId } = useStudentData();

  const [alertData, setAlertData] = useState<{
    dismissKey: string;
    message: string;
  } | null>(null);

  const [dismissed, setDismissed] = useState<string[]>([]);
  const [protocolUpdateAlert, setProtocolUpdateAlert] = useState(false);
  const prevProtocolDate = useRef<string | null>(null);

  // Carrega dismissed do localStorage assim que temos o studentId
  useEffect(() => {
    if (!studentId) return;
    setDismissed(loadDismissedTrainer(studentId));
  }, [studentId]);

  // Detecta atualização de protocolo em tempo real
  useEffect(() => {
    if (protocol?.updated_at) {
      if (
        prevProtocolDate.current &&
        prevProtocolDate.current !== protocol.updated_at
      ) {
        setProtocolUpdateAlert(true);
        setTimeout(() => setProtocolUpdateAlert(false), 15000);
      }
      prevProtocolDate.current = protocol.updated_at;
    }
  }, [protocol?.updated_at]);

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

  if (!messageVisible && !protocolUpdateAlert) return null;

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

      {/* ── Alerta de protocolo atualizado (auto-some em 15s ou ao clicar) ── */}
      {protocolUpdateAlert && (
        <Alert
          className="mb-6 border backdrop-blur-md animate-soft-pulse cursor-pointer shadow-lg transition-all relative"
          style={{
            backgroundColor: "hsla(145, 63%, 12%, 0.95)",
            borderColor: "hsl(145, 63%, 50%)",
          }}
          onClick={() => setProtocolUpdateAlert(false)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setProtocolUpdateAlert(false); }}
            className="absolute top-3 right-3 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Fechar"
            style={{ color: "hsl(145, 63%, 50%)" }}
          >
            <X className="w-4 h-4" />
          </button>
          <Zap className="h-5 w-5" style={{ color: "hsl(145, 63%, 50%)" }} />
          <AlertTitle
            className="font-bold tracking-wide"
            style={{ color: "hsl(145, 63%, 50%)" }}
          >
            Protocolo Atualizado!
          </AlertTitle>
          <AlertDescription className="mt-1 text-gray-200 pr-6">
            O seu treinador acabou de atualizar o seu Treino / Dieta. As
            mudanças já se encontram disponíveis. (Toque para dispensar)
          </AlertDescription>
        </Alert>
      )}

      {/* ── Mensagem do coach — agora tem botão X ── */}
      {messageVisible && !protocolUpdateAlert && (
        <Alert
          className="mb-6 border backdrop-blur-md animate-fade-in-down relative"
          style={{
            backgroundColor: "hsla(145, 63%, 42%, 0.1)",
            borderColor: "hsla(145, 63%, 42%, 0.2)",
          }}
        >
          {/* Botão fechar */}
          <button
            type="button"
            onClick={handleDismissMessage}
            className="absolute top-3 right-3 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Fechar mensagem do treinador"
            style={{ color: "hsl(145, 63%, 49%)" }}
          >
            <X className="w-4 h-4" />
          </button>

          <Info className="h-5 w-5" style={{ color: "hsl(145, 63%, 49%)" }} />
          <AlertTitle
            className="font-bold tracking-wide"
            style={{ color: "hsl(145, 63%, 49%)" }}
          >
            Mensagem do Treinador
          </AlertTitle>
          <AlertDescription
            className="mt-1 pr-6"
            style={{ color: "hsla(145, 63%, 90%, 0.8)" }}
          >
            "{alertData!.message}"
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
