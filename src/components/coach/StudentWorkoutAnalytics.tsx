// src/components/coach/StudentWorkoutAnalytics.tsx
// Visão analítica do Coach — 4 métricas reais baseadas em dados 100% confiáveis do banco.
//
// Métricas implementadas:
//  1. EXECUÇÃO vs PRESCRIÇÃO — reps feitas vs reps_target_min/max por exercício
//  2. VOLUME TOTAL — peso×reps somado de todas as séries (não só série 1)
//  3. DROP INTRASESSÃO — queda de carga da série 1 para a última por exercício/sessão
//  4. DURAÇÃO POR TIPO DE TREINO — tempo médio por workout_key (A/B/C/D)
//
// Mantidos do componente anterior:
//  - Cards de resumo (adesão, séries, sentimento, sono)
//  - Alertas de fadiga
//  - Lista de sessões recentes
//  - Progressão de carga (série 1 como referência de intensidade)
//  - Distribuição de esforço RPE

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Activity, Calendar, AlertTriangle,
  CheckCircle2, Dumbbell, Clock, Moon, Smile,
  BellOff, Loader2, ChevronDown, ChevronUp,
  Target, TrendingDown, BarChart2, Flame,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

/* ── Constantes ─────────────────────────────────────────────────────────────── */

const GOLD  = "#C9A84C";
const RED   = "#CC0000";
const GREEN = "#22c55e";
const BLUE  = "#60a5fa";
const MUTED = "rgba(255,255,255,0.08)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

interface SessionRow {
  id:              string;
  workout_key:     string;
  workout_label:   string | null;
  started_at:      string;
  ended_at:        string | null;
  general_feeling: number | null;
  sleep_quality:   number | null;
  is_deload_week:  boolean;
}

interface SetRow {
  session_id:       string;
  exercise_name:    string;
  exercise_key:     string;
  set_number:       number;
  weight_kg:        number | null;
  reps:             number | null;
  reps_target_min:  number | null;
  reps_target_max:  number | null;
  perceived_effort: number | null;
  executed_at:      string;
  skipped:          boolean;
}

interface AlertRow {
  id:         string;
  alert_type: string;
  severity:   "info" | "warning" | "critical";
  message:    string;
  suggestion: string | null;
  is_read:    boolean;
  created_at: string;
  context:    Record<string, unknown>;
}

interface Props {
  studentId:   string;
  studentName: string;
  coachId:     string;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function fmtDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const m = Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  if (m < 1) return "—";
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? `${m % 60}min` : ""}`;
}

function durationMinutes(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const m = Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  return m > 0 ? m : null;
}

// Novas escalas 1..4 (compatíveis com o modal pós-treino).
// Cores seguem o padrão premium: vermelho (ruim/exaurido) → amarelo →
// azul → esmeralda (excelente/disposto).
const FEELING_META: Record<number, { label: string; emoji: string; cls: string }> = {
  1: { label: "Cansado",  emoji: "🥱", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  2: { label: "Normal",   emoji: "😐", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  3: { label: "Disposto", emoji: "🔥", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  4: { label: "Exaurido", emoji: "💀", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
};
// Os códigos brutos gravados em general_feeling seguem a ORDEM DOS BOTÕES no
// modal pós-treino (1=Cansado, 2=Normal, 3=Disposto, 4=Exaurido) — NÃO uma
// escala de gravidade. Para calcular a média corretamente, convertemos cada
// código bruto para um rank real (1=pior … 4=melhor) e, no fim, achamos o
// código bruto mais próximo do rank médio só para exibir o emoji/label.
const FEELING_SEVERITY_RANK: Record<number, number> = { 4: 1, 1: 2, 2: 3, 3: 4 };
const FEELING_RANK_TO_RAW: Record<number, number> = { 1: 4, 2: 1, 3: 2, 4: 3 };
const SLEEP_META: Record<number, { label: string; emoji: string; cls: string }> = {
  1: { label: "Ruim",      emoji: "🔴", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  2: { label: "Regular",   emoji: "🟡", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  3: { label: "Boa",       emoji: "🟢", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  4: { label: "Excelente", emoji: "✨", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
};

const ALERT_META: Record<string, { label: string; icon: string }> = {
  high_rpe:      { label: "RPE alto",      icon: "🔥" },
  poor_sleep:    { label: "Sono ruim",      icon: "😴" },
  stagnation:    { label: "Estagnação",     icon: "📉" },
  low_adherence: { label: "Baixa adesão",   icon: "⚠️" },
  overreaching:  { label: "Overreaching",   icon: "💀" },
};

/* ── Tooltip personalizado ──────────────────────────────────────────────────── */

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl" style={{ background: "#1C1C1E", border: `1px solid ${GOLD}44` }}>
      <p className="font-bold text-white/70 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-bold">
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString("pt-BR") : p.value}
        </p>
      ))}
    </div>
  );
}

/* ── StatCard ───────────────────────────────────────────────────────────────── */

function StatCard({ icon, label, value, sub, color = "white" }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${MUTED}` }}>
      <div className="flex items-center gap-1.5 text-white/50">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-bold">{label}</span>
      </div>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-white/40">{sub}</p>}
    </div>
  );
}

/* ── SectionTitle ───────────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-3">
      {children}
    </p>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────────────────── */

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl p-6 text-center" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${MUTED}` }}>
      <p className="text-xs text-white/40">{text}</p>
    </div>
  );
}

/* ── Panel wrapper ──────────────────────────────────────────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${MUTED}` }}>
      {children}
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────────────────────── */

export default function StudentWorkoutAnalytics({ studentId, studentName, coachId }: Props) {
  const qc = useQueryClient();
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [selectedExKey, setSelectedExKey] = useState<string>("");

  /* ── Sessões (últimas 20 para ter dados suficientes de duração) ─────────── */
  const { data: sessions = [], isLoading: loadingSessions, isError: sessionsError } = useQuery<SessionRow[]>({
    queryKey: ["coach_student_sessions_v2", studentId],
    enabled:  !!studentId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await sb
        .from("workout_sessions")
        .select("id, workout_key, workout_label, started_at, ended_at, general_feeling, sleep_quality, is_deload_week")
        .eq("user_id", studentId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  /* ── Séries dos últimos 60 dias (60 para ter histórico de progressão real) */
  const { data: allSets = [], isLoading: loadingSets, isError: setsError } = useQuery<SetRow[]>({
    queryKey: ["coach_student_sets_v2", studentId],
    enabled:  !!studentId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from("workout_sets")
        .select("session_id, exercise_name, exercise_key, set_number, weight_kg, reps, reps_target_min, reps_target_max, perceived_effort, executed_at, skipped")
        .eq("user_id", studentId)
        .eq("completed", true)
        .gte("executed_at", since)
        .order("executed_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SetRow[];
    },
  });

  /* ── Alertas de fadiga ───────────────────────────────────────────────────── */
  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<AlertRow[]>({
    queryKey: ["coach_fatigue_alerts", coachId, studentId],
    enabled:  !!coachId && !!studentId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await sb
        .from("coach_fatigue_alerts")
        .select("id, alert_type, severity, message, suggestion, is_read, created_at, context")
        .eq("coach_id", coachId)
        .eq("student_id", studentId)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
  });

  /* ── Mutation: marcar alerta como resolvido ──────────────────────────────── */
  const markRead = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await sb
        .from("coach_fatigue_alerts")
        .update({ is_read: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach_fatigue_alerts", coachId, studentId] });
      toast.success("Alerta resolvido.");
    },
  });

  /* ── CÁLCULOS ────────────────────────────────────────────────────────────── */

  const completedSets = useMemo(() => allSets.filter((s) => !s.skipped), [allSets]);

  // Exercícios únicos com pelo menos 1 série com peso
  const uniqueExercises = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; name: string }[] = [];
    for (const s of completedSets) {
      if (!seen.has(s.exercise_key) && s.weight_kg != null) {
        seen.add(s.exercise_key);
        list.push({ key: s.exercise_key, name: s.exercise_name });
      }
    }
    return list;
  }, [completedSets]);

  const activeExKey = selectedExKey || uniqueExercises[0]?.key || "";

  // ── MÉTRICA 1: Execução vs Prescrição ──────────────────────────────────────
  // Para cada série, classifica: bateu a faixa / ficou abaixo / superou / sem meta
  const execVsPresData = useMemo(() => {
    const byEx = new Map<string, { name: string; dentro: number; abaixo: number; acima: number; semMeta: number }>();
    for (const s of completedSets) {
      if (s.reps == null) continue;
      if (!byEx.has(s.exercise_key)) {
        byEx.set(s.exercise_key, { name: s.exercise_name, dentro: 0, abaixo: 0, acima: 0, semMeta: 0 });
      }
      const ex = byEx.get(s.exercise_key)!;
      const min = s.reps_target_min;
      const max = s.reps_target_max;
      if (min == null || max == null || (min === 0 && max === 0)) {
        ex.semMeta++;
      } else if (s.reps < min) {
        ex.abaixo++;
      } else if (s.reps > max) {
        ex.acima++;
      } else {
        ex.dentro++;
      }
    }
    return Array.from(byEx.values()).map((ex) => {
      const total = ex.dentro + ex.abaixo + ex.acima + ex.semMeta;
      const comMeta = ex.dentro + ex.abaixo + ex.acima;
      const pctDentro = comMeta > 0 ? Math.round((ex.dentro / comMeta) * 100) : null;
      return { ...ex, total, comMeta, pctDentro };
    }).filter((ex) => ex.comMeta > 0)
      .sort((a, b) => (a.pctDentro ?? 0) - (b.pctDentro ?? 0));
  }, [completedSets]);

  // ── MÉTRICA 2: Volume Total por exercício (peso×reps, todas as séries) ────
  const volumeByExSession = useMemo(() => {
    // Agrupa por exercício e por sessão → volume total (kg movidos)
    type Point = { date: string; volume: number; sessionId: string };
    const byEx = new Map<string, { name: string; points: Point[] }>();
    const sessionDates = new Map<string, string>(
      sessions.map((s) => [s.id, s.started_at])
    );

    for (const s of completedSets) {
      if (s.weight_kg == null || s.reps == null) continue;
      const dateStr = sessionDates.get(s.session_id) ?? s.executed_at;
      if (!byEx.has(s.exercise_key)) {
        byEx.set(s.exercise_key, { name: s.exercise_name, points: [] });
      }
      const ex = byEx.get(s.exercise_key)!;
      const existing = ex.points.find((p) => p.sessionId === s.session_id);
      const vol = Math.round(s.weight_kg * s.reps);
      if (existing) {
        existing.volume += vol;
      } else {
        ex.points.push({ date: fmtDate(dateStr), volume: vol, sessionId: s.session_id });
      }
    }
    return byEx;
  }, [completedSets, sessions]);

  const activeVolumePoints = useMemo(() => {
    return volumeByExSession.get(activeExKey)?.points ?? [];
  }, [volumeByExSession, activeExKey]);

  // ── MÉTRICA 3: Drop intrasessão ────────────────────────────────────────────
  // Para cada sessão do exercício selecionado: carga série 1 vs carga última série
  const dropData = useMemo(() => {
    if (!activeExKey) return [];
    const sessionMap = new Map<string, { sessionId: string; date: string; sets: SetRow[] }>();
    for (const s of completedSets) {
      if (s.exercise_key !== activeExKey || s.weight_kg == null) continue;
      const dateStr = sessions.find((ss) => ss.id === s.session_id)?.started_at ?? s.executed_at;
      if (!sessionMap.has(s.session_id)) {
        sessionMap.set(s.session_id, { sessionId: s.session_id, date: fmtDate(dateStr), sets: [] });
      }
      sessionMap.get(s.session_id)!.sets.push(s);
    }
    return Array.from(sessionMap.values())
      .filter((sess) => sess.sets.length >= 2)
      .map((sess) => {
        const sorted = [...sess.sets].sort((a, b) => a.set_number - b.set_number);
        const first  = sorted[0].weight_kg!;
        const last   = sorted[sorted.length - 1].weight_kg!;
        const dropKg = first - last;
        const dropPct = first > 0 ? Math.round((dropKg / first) * 100) : 0;
        return { date: sess.date, primeiraKg: first, ultimaKg: last, dropKg, dropPct };
      })
      .slice(-8); // últimas 8 sessões
  }, [completedSets, activeExKey, sessions]);

  // ── MÉTRICA 4: Duração média por tipo de treino ────────────────────────────
  const durationByType = useMemo(() => {
    const byKey = new Map<string, number[]>();
    for (const s of sessions) {
      const dur = durationMinutes(s.started_at, s.ended_at);
      if (dur == null || dur < 10 || dur > 240) continue; // ignora < 10min ou > 4h (dados espúrios)
      if (!byKey.has(s.workout_key)) byKey.set(s.workout_key, []);
      byKey.get(s.workout_key)!.push(dur);
    }
    return Array.from(byKey.entries())
      .map(([key, durations]) => ({
        key,
        media: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        min:   Math.min(...durations),
        max:   Math.max(...durations),
        count: durations.length,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [sessions]);

  // ── Stats de resumo ────────────────────────────────────────────────────────
  // Adesão: sessões concluídas ÷ teto de 12 sessões de referência.
  // Numerador também é limitado ao mesmo teto para que o resultado nunca
  // ultrapasse 100% (aluno com > 12 sessões concluídas mantém 100%).
  const adherenceRate = sessions.length > 0
    ? Math.round((Math.min(sessions.filter((s) => s.ended_at).length, 12) / Math.min(sessions.length, 12)) * 100)
    : 0;

  const totalSetsCount   = completedSets.length;
  const totalVolume      = completedSets.reduce((a, s) => a + ((s.weight_kg ?? 0) * (s.reps ?? 0)), 0);

  // Média calculada sobre o RANK de severidade (1=pior, 4=melhor), não sobre
  // os códigos brutos. Ver comentário em FEELING_SEVERITY_RANK.
  const feelingSessions   = sessions.filter((s) => s.general_feeling != null && FEELING_SEVERITY_RANK[s.general_feeling as number] != null);
  const feelingAvgRank    = feelingSessions.length > 0
    ? feelingSessions.reduce((a, s) => a + (FEELING_SEVERITY_RANK[s.general_feeling as number] ?? 0), 0) / feelingSessions.length
    : null;
  const feelingAvg        = feelingAvgRank != null ? feelingAvgRank.toFixed(1) : "—";
  const feelingAvgRawKey  = feelingAvgRank != null
    ? FEELING_RANK_TO_RAW[Math.min(4, Math.max(1, Math.round(feelingAvgRank)))]
    : null;

  const sleepSessions    = sessions.filter((s) => s.sleep_quality);
  const sleepAvg         = sleepSessions.length > 0
    ? (sleepSessions.reduce((a, s) => a + (s.sleep_quality ?? 0), 0) / sleepSessions.length).toFixed(1)
    : "—";

  // Volume semanal (últimos 7 dias)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const volumeWeekData = last7.map((dateStr) => {
    const daySets = completedSets.filter((s) => s.executed_at.slice(0, 10) === dateStr);
    return {
      date:   new Date(dateStr).toLocaleDateString("pt-BR", { weekday: "short" }),
      séries: daySets.length,
      falhas: daySets.filter((s) => s.perceived_effort === 3).length,
    };
  });

  // Distribuição de esforço
  const totalForEffort = completedSets.length;
  const effortCounts = {
    limpos:  completedSets.filter((s) => s.perceived_effort === 1).length,
    pesados: completedSets.filter((s) => s.perceived_effort === 2).length,
    falhas:  completedSets.filter((s) => s.perceived_effort === 3).length,
  };
  const effortSemRpe = totalForEffort - effortCounts.limpos - effortCounts.pesados - effortCounts.falhas;

  // Progressão de carga clássica (série 1 como referência de intensidade)
  const loadProgressionData = completedSets
    .filter((s) => s.exercise_key === activeExKey && s.set_number === 1 && s.weight_kg != null)
    .map((s) => ({
      date:   fmtDate(s.executed_at),
      carga:  s.weight_kg ?? 0,
      reps:   s.reps ?? 0,
    }));

  const unreadAlerts   = alerts.filter((a) => !a.is_read);
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && !a.is_read);
  const isLoading      = loadingSessions || loadingSets || loadingAlerts;
  const hasData        = sessions.length > 0 || allSets.length > 0;

  /* ── Render ──────────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-white/40">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Carregando dados de {studentName}…</span>
      </div>
    );
  }

  if (sessionsError || setsError) {
    return (
      <div className="p-6 text-center text-sm text-destructive">
        Erro ao carregar dados de treino. Tente recarregar a página.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Alertas de fadiga ─────────────────────────────────────────────── */}
      {/* [OCULTO] Banner de alertas de fadiga temporariamente escondido —
          leitura/resolução via markRead permanece funcional, apenas não
          renderizamos a seção. */}
      {false && (
      <AnimatePresence>
        {unreadAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${criticalAlerts.length > 0 ? RED : GOLD}66`,
              background: criticalAlerts.length > 0 ? "rgba(204,0,0,0.06)" : "rgba(201,168,76,0.06)",
            }}
          >
            <div className="px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: criticalAlerts.length > 0 ? RED : GOLD }} />
              <p className="font-bold text-sm flex-1" style={{ color: criticalAlerts.length > 0 ? RED : GOLD }}>
                {criticalAlerts.length > 0 ? `${criticalAlerts.length} alerta(s) crítico(s)` : `${unreadAlerts.length} alerta(s) de fadiga`}
              </p>
              <Badge style={{ background: (criticalAlerts.length > 0 ? RED : GOLD) + "22", color: criticalAlerts.length > 0 ? RED : GOLD, border: "none" }}>
                {unreadAlerts.length}
              </Badge>
            </div>
            <div className="divide-y divide-white/5">
              {unreadAlerts.slice(0, 5).map((alert) => {
                const meta     = ALERT_META[alert.alert_type] ?? { label: alert.alert_type, icon: "⚠️" };
                const isExpand = expandedAlert === alert.id;
                return (
                  <div key={alert.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0 mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider font-bold"
                            style={{ color: alert.severity === "critical" ? RED : GOLD }}>
                            {meta.label}
                          </span>
                          <span className="text-[9px] text-white/40">{fmtDate(alert.created_at)}</span>
                        </div>
                        <p className="text-xs text-white/80 mt-0.5 leading-relaxed">{alert.message}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button"
                          onClick={() => setExpandedAlert(isExpand ? null : alert.id)}
                          className="p-1 rounded text-white/40 hover:text-white/70 transition">
                          {isExpand ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button"
                          onClick={() => markRead.mutate(alert.id)}
                          disabled={markRead.isPending}
                          className="p-1 rounded text-white/40 hover:text-green-400 transition"
                          title="Marcar como resolvido">
                          {markRead.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpand && alert.suggestion && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="pl-7">
                          <p className="text-[11px] text-white/60 leading-relaxed p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                            💡 {alert.suggestion}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sem dados ─────────────────────────────────────────────────────── */}
      {!hasData && (
        <div className="rounded-xl p-8 text-center space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${MUTED}` }}>
          <Dumbbell className="w-8 h-8 text-white/20 mx-auto" />
          <p className="text-sm text-white/40">Este aluno ainda não registrou nenhum treino pelo app.</p>
          <p className="text-xs text-white/20">Os dados aparecem automaticamente após o primeiro treino concluído.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* ── Cards de resumo ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="Adesão"
              value={`${adherenceRate}%`}
              sub={`${sessions.length} sessões`}
              color={adherenceRate >= 80 ? GREEN : adherenceRate >= 60 ? GOLD : RED}
            />
            <StatCard
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Volume (60d)"
              value={`${Math.round(totalVolume / 1000)}t`}
              sub={`${totalSetsCount} séries`}
              color={BLUE}
            />
            <StatCard
              icon={<Smile className="w-3.5 h-3.5" />}
              label="Sentimento"
              value={feelingAvgRawKey != null ? `${FEELING_META[feelingAvgRawKey]?.emoji ?? ""} ${feelingAvg}` : "—"}
              sub="média das sessões"
            />
            <StatCard
              icon={<Moon className="w-3.5 h-3.5" />}
              label="Sono"
              value={sleepAvg !== "—" ? `${SLEEP_META[Math.round(Number(sleepAvg))]?.emoji ?? ""} ${sleepAvg}` : "—"}
              sub="média das sessões"
            />
          </div>

          {/* ── Tabs principais ─────────────────────────────────────────── */}
          <Tabs defaultValue="execution">
            <TabsList className="grid w-full grid-cols-4 text-[11px]">
              <TabsTrigger value="execution" className="gap-1">
                <Target className="w-3 h-3" />
                <span className="hidden sm:inline">Execução</span>
                <span className="sm:hidden">Exec.</span>
              </TabsTrigger>
              <TabsTrigger value="load" className="gap-1">
                <TrendingUp className="w-3 h-3" />
                Carga
              </TabsTrigger>
              <TabsTrigger value="volume" className="gap-1">
                <BarChart2 className="w-3 h-3" />
                Volume
              </TabsTrigger>
              <TabsTrigger value="sessions" className="gap-1">
                <Calendar className="w-3 h-3" />
                <span className="hidden sm:inline">Sessões</span>
                <span className="sm:hidden">Sess.</span>
              </TabsTrigger>
            </TabsList>

            {/* ════════════════════════════════════════════════════════════
                ABA 1: EXECUÇÃO vs PRESCRIÇÃO
                Mostra para cada exercício o % de séries dentro da faixa
                prescrita pelo coach (reps_target_min — reps_target_max).
                Coach vê de imediato quais exercícios o aluno está falhando.
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="execution" className="space-y-3 mt-3">
              {execVsPresData.length === 0 ? (
                <EmptyState text="Nenhuma série com faixa de reps prescrita nos últimos 60 dias." />
              ) : (
                <>
                  <Panel>
                    <SectionTitle>Execução vs. prescrição — reps feitas vs. meta do coach (60d)</SectionTitle>
                    <div className="space-y-3">
                      {execVsPresData.map((ex) => {
                        const pct = ex.pctDentro ?? 0;
                        const color = pct >= 75 ? GREEN : pct >= 50 ? GOLD : RED;
                        return (
                          <div key={ex.name} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-white/80 truncate max-w-[55%]">{ex.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-white/40">{ex.comMeta} séries</span>
                                <span className="text-xs font-black" style={{ color }}>{pct}% na meta</span>
                              </div>
                            </div>
                            {/* Barra empilhada: abaixo / dentro / acima */}
                            <div className="flex h-2 rounded-full overflow-hidden gap-px">
                              {ex.abaixo > 0 && (
                                <motion.div
                                  className="h-full rounded-l-full"
                                  style={{ background: RED, width: `${Math.round((ex.abaixo / ex.comMeta) * 100)}%` }}
                                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.5, ease: "easeOut" }}
                                />
                              )}
                              {ex.dentro > 0 && (
                                <motion.div
                                  className="h-full"
                                  style={{ background: GREEN, width: `${Math.round((ex.dentro / ex.comMeta) * 100)}%` }}
                                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
                                />
                              )}
                              {ex.acima > 0 && (
                                <motion.div
                                  className="h-full rounded-r-full"
                                  style={{ background: BLUE, width: `${Math.round((ex.acima / ex.comMeta) * 100)}%` }}
                                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                                  transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Legenda */}
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
                      {[
                        { color: RED,   label: "Abaixo da meta" },
                        { color: GREEN, label: "Na meta" },
                        { color: BLUE,  label: "Acima da meta" },
                      ].map((l) => (
                        <div key={l.label} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                          <span className="text-[10px] text-white/40">{l.label}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  {/* Resumo textual para o coach */}
                  <Panel>
                    <SectionTitle>Diagnóstico rápido</SectionTitle>
                    <div className="space-y-1.5">
                      {execVsPresData.slice(0, 3).map((ex) => {
                        const pct = ex.pctDentro ?? 0;
                        const icon = pct >= 75 ? "✅" : pct >= 50 ? "⚠️" : "🔴";
                        const msg  = pct >= 75
                          ? "executando dentro da faixa prescrita"
                          : pct >= 50
                          ? "frequentemente fora da faixa — revisar carga"
                          : "consistentemente fora da meta — ajuste necessário";
                        return (
                          <p key={ex.name} className="text-xs text-white/60 leading-relaxed">
                            {icon} <span className="text-white/80 font-semibold">{ex.name.split(" ").slice(0, 3).join(" ")}</span>: {msg}
                          </p>
                        );
                      })}
                    </div>
                  </Panel>
                </>
              )}
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                ABA 2: PROGRESSÃO DE CARGA + DROP INTRASESSÃO
                Progressão clássica (série 1) + drop de carga dentro da sessão.
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="load" className="space-y-3 mt-3">
              {uniqueExercises.length === 0 ? (
                <EmptyState text="Nenhum dado de carga disponível ainda." />
              ) : (
                <>
                  {/* Seletor de exercício */}
                  <div className="flex gap-1.5 flex-wrap">
                    {uniqueExercises.slice(0, 8).map((ex) => (
                      <button key={ex.key} type="button"
                        onClick={() => setSelectedExKey(ex.key)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition"
                        style={
                          activeExKey === ex.key
                            ? { background: GOLD + "22", borderColor: GOLD, color: GOLD }
                            : { background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }
                        }
                      >
                        {ex.name.split(" ").slice(0, 2).join(" ")}
                      </button>
                    ))}
                  </div>

                  {/* Progressão série 1 */}
                  <Panel>
                    <SectionTitle>
                      Intensidade (série 1) — {uniqueExercises.find((e) => e.key === activeExKey)?.name}
                    </SectionTitle>
                    {loadProgressionData.length < 2 ? (
                      <EmptyState text="Mínimo 2 sessões para exibir progressão." />
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={loadProgressionData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }} />
                            <Line type="monotone" dataKey="carga" name="Carga (kg)" stroke={GOLD} strokeWidth={2.5} dot={{ r: 4, fill: GOLD }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="reps" name="Reps" stroke={BLUE} strokeWidth={1.5} dot={{ r: 3, fill: BLUE }} strokeDasharray="4 2" />
                          </LineChart>
                        </ResponsiveContainer>
                        {loadProgressionData.length >= 2 && (() => {
                          const last  = loadProgressionData.at(-1)!;
                          const prev  = loadProgressionData.at(-2)!;
                          const delta = last.carga - prev.carga;
                          const pct   = prev.carga > 0 ? ((delta / prev.carga) * 100).toFixed(1) : "—";
                          return (
                            <div className="mt-3 flex items-center gap-4 pt-3 border-t border-white/5">
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-white/40">Última</p>
                                <p className="text-sm font-black text-white">{last.carga}kg × {last.reps} reps</p>
                              </div>
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-white/40">Variação</p>
                                <p className="text-sm font-black" style={{ color: delta > 0 ? GREEN : delta < 0 ? RED : "rgba(255,255,255,0.6)" }}>
                                  {delta > 0 ? "+" : ""}{delta}kg ({pct}%)
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </Panel>

                  {/* Drop intrasessão */}
                  <Panel>
                    <SectionTitle>
                      <TrendingDown className="w-3 h-3 inline mr-1 mb-0.5" />
                      Drop intrasessão — queda de carga da 1ª para a última série
                    </SectionTitle>
                    {dropData.length < 2 ? (
                      <EmptyState text="Mínimo 2 sessões com 2+ séries para calcular o drop." />
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={150}>
                          <BarChart data={dropData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} unit="%" />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine y={10} stroke={GOLD} strokeDasharray="4 2" label={{ value: "10% (ref.)", fontSize: 9, fill: GOLD }} />
                            <Bar
                              dataKey="dropPct"
                              name="Drop (%)"
                              radius={[4, 4, 0, 0]}
                              // Verde se ≤10%, dourado se ≤20%, vermelho se >20%
                              fill={RED}
                            >
                              {dropData.map((entry, index) => (
                                <rect
                                  key={index}
                                  fill={entry.dropPct <= 10 ? GREEN : entry.dropPct <= 20 ? GOLD : RED}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <p className="text-[10px] text-white/30 mt-2">
                          Verde ≤10% (excelente) · Dourado ≤20% (aceitável) · Vermelho &gt;20% (revisar carga ou volume)
                        </p>
                        {/* Média do drop */}
                        {dropData.length > 0 && (() => {
                          const avgDrop = Math.round(dropData.reduce((a, d) => a + d.dropPct, 0) / dropData.length);
                          const cor     = avgDrop <= 10 ? GREEN : avgDrop <= 20 ? GOLD : RED;
                          return (
                            <div className="mt-3 pt-3 border-t border-white/5">
                              <p className="text-[9px] uppercase tracking-wider text-white/40">Drop médio</p>
                              <p className="text-xl font-black" style={{ color: cor }}>{avgDrop}%</p>
                              <p className="text-[10px] text-white/30 mt-0.5">
                                {avgDrop <= 10
                                  ? "Excelente resistência à fadiga — carga bem calibrada."
                                  : avgDrop <= 20
                                  ? "Aceitável — acompanhe a tendência nas próximas sessões."
                                  : "Drop alto — considere reduzir o volume ou a carga de trabalho."}
                              </p>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </Panel>
                </>
              )}
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                ABA 3: VOLUME
                Volume total (peso×reps todas as séries) + duração por treino
                + distribuição de esforço RPE
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="volume" className="space-y-3 mt-3">

              {/* Volume total por sessão do exercício selecionado */}
              {uniqueExercises.length > 0 && (
                <Panel>
                  <SectionTitle>
                    Volume total por sessão — {uniqueExercises.find((e) => e.key === activeExKey)?.name ?? "—"}
                    <span className="text-white/20 ml-1">(kg × reps, todas as séries)</span>
                  </SectionTitle>
                  {/* Seletor compacto de exercício */}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {uniqueExercises.slice(0, 6).map((ex) => (
                      <button key={ex.key} type="button"
                        onClick={() => setSelectedExKey(ex.key)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition"
                        style={
                          activeExKey === ex.key
                            ? { background: BLUE + "22", borderColor: BLUE, color: BLUE }
                            : { background: "transparent", borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)" }
                        }
                      >
                        {ex.name.split(" ").slice(0, 2).join(" ")}
                      </button>
                    ))}
                  </div>
                  {activeVolumePoints.length < 2 ? (
                    <EmptyState text="Mínimo 2 sessões para exibir volume." />
                  ) : (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={activeVolumePoints} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="volume" name="Volume (kg)" stroke={BLUE} strokeWidth={2.5} dot={{ r: 4, fill: BLUE }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Panel>
              )}

              {/* Volume semanal (séries por dia) */}
              <Panel>
                <SectionTitle>Séries por dia — última semana</SectionTitle>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={volumeWeekData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }} />
                    <Bar dataKey="séries" fill={BLUE} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="falhas" fill={RED}  radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Duração por tipo de treino */}
              {durationByType.length > 0 && (
                <Panel>
                  <SectionTitle>
                    <Clock className="w-3 h-3 inline mr-1 mb-0.5" />
                    Duração média por treino
                  </SectionTitle>
                  <div className="space-y-2">
                    {durationByType.map((t) => (
                      <div key={t.key} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                            style={{ background: GOLD + "22", color: GOLD }}>
                            {t.key}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{t.media}min</p>
                            <p className="text-[10px] text-white/30">{t.count} sessão{t.count !== 1 ? "s" : ""} · {t.min}–{t.max}min</p>
                          </div>
                        </div>
                        {/* Barra de duração relativa */}
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: t.media < 30 ? RED : t.media > 90 ? BLUE : GREEN,
                              width: `${Math.min((t.media / 120) * 100, 100)}%`,
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((t.media / 120) * 100, 100)}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/20 mt-3">
                    Verde 30–90min (ideal) · Vermelho &lt;30min (treino muito curto) · Azul &gt;90min (longo)
                  </p>
                </Panel>
              )}

              {/* Distribuição de esforço RPE */}
              {totalForEffort > 0 && (
                <Panel>
                  <SectionTitle>Distribuição de esforço (60d)</SectionTitle>
                  <div className="space-y-3">
                    {[
                      { label: "✅ Limpo (RIR 3+)",   count: effortCounts.limpos,  color: GREEN },
                      { label: "🔥 Pesado (RIR 1-2)", count: effortCounts.pesados, color: GOLD  },
                      { label: "💀 Falhei (RIR 0)",   count: effortCounts.falhas,  color: RED   },
                    ].map((row) => {
                      const base = totalForEffort - effortSemRpe;
                      const pct  = base > 0 ? Math.round((row.count / base) * 100) : 0;
                      return (
                        <div key={row.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span style={{ color: row.color }}>{row.label}</span>
                            <span className="text-white/50 font-bold">{row.count} ({pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: row.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {effortSemRpe > 0 && (
                      <p className="text-[10px] text-white/30">{effortSemRpe} séries sem RPE registrado.</p>
                    )}
                  </div>
                </Panel>
              )}
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                ABA 4: SESSÕES RECENTES
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="sessions" className="space-y-2 mt-3">
              {sessions.length === 0 ? (
                <EmptyState text="Nenhuma sessão registrada ainda." />
              ) : (
                sessions.map((s) => {
                  const duration = fmtDuration(s.started_at, s.ended_at);
                  return (
                    <div key={s.id} className="rounded-xl p-3 flex items-center gap-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${MUTED}` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
                        style={{ background: "rgba(255,255,255,0.06)", color: GOLD }}>
                        {s.workout_key}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {s.workout_label ? `${s.workout_key} · ${s.workout_label}` : `Treino ${s.workout_key}`}
                          {s.is_deload_week && (
                            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-bold"
                              style={{ background: BLUE + "22", color: BLUE }}>Deload</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-white/40">{fmtDate(s.started_at)}</span>
                          {duration !== "—" && (
                            <span className="flex items-center gap-1 text-[10px] text-white/40">
                              <Clock className="w-2.5 h-2.5" />{duration}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[45%]">
                        {s.sleep_quality != null && SLEEP_META[s.sleep_quality] && (
                          <Badge
                            variant="outline"
                            className={`gap-1 text-[10px] font-bold px-2 py-0.5 ${SLEEP_META[s.sleep_quality].cls}`}
                            title={`Sono: ${SLEEP_META[s.sleep_quality].label}`}
                          >
                            <Moon className="w-3 h-3" /> {SLEEP_META[s.sleep_quality].label}
                          </Badge>
                        )}
                        {s.general_feeling != null && FEELING_META[s.general_feeling] && (
                          <Badge
                            variant="outline"
                            className={`gap-1 text-[10px] font-bold px-2 py-0.5 ${FEELING_META[s.general_feeling].cls}`}
                            title={`Sensação: ${FEELING_META[s.general_feeling].label}`}
                          >
                            <Flame className="w-3 h-3" /> {FEELING_META[s.general_feeling].label}
                          </Badge>
                        )}
                        {s.ended_at
                          ? <CheckCircle2 className="w-4 h-4" style={{ color: GREEN }} />
                          : <Clock className="w-4 h-4 text-white/20" />
                        }
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
