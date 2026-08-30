/**
 * FeedbackCountdownAlert — Avisa o aluno sobre o próximo feedback.
 * Aparece nos mesmos slots dos demais alertas (StudentArea).
 *
 * A contagem usa o último check-in ou, se inexistente, a anamnese, e os
 * limiares (`warningDays`/`criticalDays`) são os MESMOS que o coach
 * configurou para este aluno em coach_students — os mesmos que já valem
 * para o badge "Crítico"/"Atenção" no dashboard do coach (useCoachStudents)
 * e para os e-mails de lembrete (checkin-reminder-emails). Sem isso, um
 * aluno com cadência customizada (ex.: acompanhamento semanal) via este
 * card mostrando prazos fixos de 13/14/16/17 dias, fora de sincronia com o
 * que o coach e os e-mails já mostravam para o mesmo aluno.
 *
 * Regras (com os defaults de 14/16 dias, iguais aos do resto do app):
 *  - 13 dias  → pré-aviso (azul)
 *  - 14 dias  → dia do feedback (verde)
 *  - 15-16    → atrasado leve (laranja)
 *  - ≥17      → atrasado crítico (vermelho)
 */

import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Clock, CalendarCheck, AlertTriangle, TrendingUp, ArrowRight, X, Flame } from "lucide-react";

interface Props {
  userId: string;
  dismissed: string[];
  onDismiss: (id: string) => void;
  /** Vem de coach_students.warning_days (via coachLink em StudentArea). Default 14, igual ao resto do app. */
  warningDays?: number;
  /** Vem de coach_students.critical_days (via coachLink em StudentArea). Default 16, igual ao resto do app. */
  criticalDays?: number;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export default function FeedbackCountdownAlert({ userId, dismissed, onDismiss, warningDays, criticalDays }: Props) {
  const navigate = useNavigate();

  // Mesmos defaults usados em useCoachStudents.ts (dashboard do coach) e em
  // checkin-reminder-emails (e-mails D-1/D0/D+2) — se o coach não customizou
  // nada para este aluno, os três sistemas concordam em 14/16.
  const warning = warningDays ?? 14;
  const critical = criticalDays ?? 16;
  const preDay = Math.max(warning - 1, 1);

  const { data } = useQuery({
    queryKey: ["student-feedback-countdown", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: ci }, { data: proto }] = await Promise.all([
        supabase
          .from("check_ins")
          .select("submitted_at")
          .eq("student_id", userId)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("protocols")
          .select("student_first_viewed_at")
          .eq("student_id", userId)
          .not("student_first_viewed_at", "is", null)
          .order("student_first_viewed_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      const lastCheckin = ci?.submitted_at ?? null;
      const firstOpened = (proto as { student_first_viewed_at?: string | null } | null)?.student_first_viewed_at ?? null;
      return { lastCheckin, firstOpened };
    },
  });

  if (!data) return null;

  // A contagem só começa quando o aluno abriu o protocolo pela primeira vez —
  // mesma regra do radar do coach. Antes disso, nenhum aviso de atraso.
  const daysOpened = daysSince(data.firstOpened);
  if (daysOpened == null) return null;

  // Conta a partir do último feedback OU da 1ª abertura do protocolo.
  const days = daysSince(data.lastCheckin) ?? daysOpened;


  // Renderização positiva: se ainda não é dia de feedback (days < preDay) mas
  // o aluno tem sequência (streak >= 2) e já está na reta final, reforça o
  // gatilho de "não quebrar a série" antes de virar cobrança. A "reta final"
  // é sempre 3 dias antes do pré-aviso (10 quando warning=14, preDay=13 —
  // igual ao comportamento original; escala junto se o coach customizar).
  if (days < preDay) {
    return (
      <StreakEncouragement
        userId={userId}
        days={days}
        retaFinalThreshold={Math.max(preDay - 3, 1)}
        dismissed={dismissed}
        onDismiss={onDismiss}
      />
    );
  }

  // Bucket
  type Bucket = "pre" | "today" | "late" | "critical";
  const bucket: Bucket =
    days === preDay ? "pre" : days === warning ? "today" : days <= critical ? "late" : "critical";

  // ID por bucket + dia para o dismiss ser "do dia"
  const todayKey = new Date().toISOString().slice(0, 10);
  const id = `fb-countdown-${bucket}-${todayKey}`;
  if (dismissed.includes(id)) return null;

  const cfg = (() => {
    switch (bucket) {
      case "pre":
        return {
          Icon: Clock,
          title: "Seu próximo feedback está chegando",
          body:
            "Amanhã será o momento de atualizar sua evolução. Reserve alguns minutos para preencher o feedback e manter seu plano alinhado aos seus objetivos.",
          cta: "Adiantar feedback",
          cls: "bg-sky-500/10 border-sky-500/25 text-sky-700 dark:text-sky-300",
          iconCls: "text-sky-500",
          ctaCls: "text-sky-600 hover:text-sky-700 dark:text-sky-300",
        };
      case "today":
        return {
          Icon: TrendingUp,
          title: "Hora de evoluir",
          body:
            "Hoje é dia de feedback! Atualize sua evolução para que possamos acompanhar seus resultados e fazer os ajustes necessários no seu plano.",
          cta: "Enviar feedback agora",
          cls: "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300",
          iconCls: "text-emerald-500",
          ctaCls: "text-emerald-600 hover:text-emerald-700 dark:text-emerald-300",
        };
      case "late":
        return {
          Icon: CalendarCheck,
          title: "Feedback pendente",
          body:
            `Seu feedback está ${days - warning} dia(s) atrasado. Sem essa atualização fica mais difícil acompanhar sua evolução — envie assim que possível para mantermos o plano calibrado.`,
          cta: "Enviar feedback",
          cls: "bg-orange-500/10 border-orange-500/25 text-orange-700 dark:text-orange-300",
          iconCls: "text-orange-500",
          ctaCls: "text-orange-600 hover:text-orange-700 dark:text-orange-300",
        };
      case "critical":
      default:
        return {
          Icon: AlertTriangle,
          title: "Feedback em atraso crítico",
          body:
            `Já se passaram ${days} dias desde sua última atualização. Sem feedback recente, não conseguimos ajustar seu protocolo com precisão. Envie agora para retomar o ritmo.`,
          cta: "Enviar feedback agora",
          cls: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
          iconCls: "text-red-500",
          ctaCls: "text-red-600 hover:text-red-700 dark:text-red-300",
        };
    }
  })();

  const { Icon } = cfg;

  return (
    <div className={`rounded-xl border p-4 relative shadow-sm ${cfg.cls}`}>
      <button
        onClick={() => onDismiss(id)}
        className="absolute top-3 right-3 opacity-70 hover:opacity-100"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${cfg.iconCls}`} />
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-bold">{cfg.title}</h3>
          <p className="text-xs mt-1 opacity-90 leading-relaxed">{cfg.body}</p>
          <button
            type="button"
            onClick={() => navigate("/check-in")}
            className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${cfg.ctaCls}`}
          >
            {cfg.cta} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Elogia o aluno que está mantendo a sequência de check-ins.
 * Usa a função `get_checkin_streak` do banco.
 */
function StreakEncouragement({
  userId, days, retaFinalThreshold, dismissed, onDismiss,
}: {
  userId: string; days: number; retaFinalThreshold: number; dismissed: string[]; onDismiss: (id: string) => void;
}) {
  const { data: streak } = useQuery({
    queryKey: ["checkin-streak", userId],
    enabled: !!userId,
    staleTime: 60_000 * 30,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("get_checkin_streak", { p_student_id: userId });
      return typeof data === "number" ? data : 0;
    },
  });

  if (!streak || streak < 2 || days < retaFinalThreshold) return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const id = `fb-streak-${todayKey}`;
  if (dismissed.includes(id)) return null;

  return (
    <div className="rounded-xl border p-4 relative shadow-sm bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300">
      <button
        onClick={() => onDismiss(id)}
        className="absolute top-3 right-3 opacity-70 hover:opacity-100"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <Flame className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-bold">
            {streak} check-ins seguidos 🔥
          </h3>
          <p className="text-xs mt-1 opacity-90 leading-relaxed">
            Você está construindo uma sequência forte. Faltam poucos dias pro próximo feedback — não deixe a série cair agora.
          </p>
        </div>
      </div>
    </div>
  );
}
