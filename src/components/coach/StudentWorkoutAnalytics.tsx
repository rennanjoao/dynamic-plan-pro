// src/components/coach/StudentWorkoutAnalytics.tsx
// Visão analítica do Coach — progressão de carga, volume semanal, adesão e alertas de fadiga.
// Consome: workout_sessions, workout_sets, coach_fatigue_alerts (schema Sprint 1).
// Dependências: recharts, @tanstack/react-query, lucide-react, framer-motion, Radix Tabs.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, Activity, Calendar, AlertTriangle,
  CheckCircle2, Dumbbell, Clock, Moon, Smile,
  BellOff, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

/* ── Constantes ─────────────────────────────────────────────────────────────── */

const GOLD    = "#C9A84C";
const RED     = "#CC0000";
const GREEN   = "#22c55e";
const BLUE    = "#60a5fa";

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
  exercise_name:   string;
  exercise_key:    string;
  muscle_group:    string | null;
  set_number:      number;
  weight_kg:       number | null;
  reps:            number | null;
  perceived_effort: number | null;
  executed_at:     string;
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
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? `${m % 60}min` : ""}`;
}

const FEELING_EMOJI: Record<number, string> = { 1: "😓", 2: "😊", 3: "💪" };
const SLEEP_EMOJI:   Record<number, string> = { 1: "😴", 2: "😊", 3: "🌙" };

const ALERT_META: Record<string, { label: string; icon: string }> = {
  high_rpe:      { label: "RPE alto",      icon: "🔥" },
  poor_sleep:    { label: "Sono ruim",      icon: "😴" },
  stagnation:    { label: "Estagnação",     icon: "📉" },
  low_adherence: { label: "Baixa adesão",   icon: "⚠️" },
  overreaching:  { label: "Overreaching",   icon: "💀" },
};

/* ── Tooltip personalizado do Recharts ──────────────────────────────────────── */

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl" style={{ background: "#1C1C1E", border: `1px solid ${GOLD}44` }}>
      <p className="font-bold text-white/70 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-bold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

/* ── Card de estatística ────────────────────────────────────────────────────── */

function StatCard({ icon, label, value, sub, color = "white" }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-1.5 text-white/50">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-bold">{label}</span>
      </div>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-white/40">{sub}</p>}
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────────────────────── */

export default function StudentWorkoutAnalytics({ studentId, studentName, coachId }: Props) {
  const qc = useQueryClient();
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  /* ── Sessões (últimas 12) ─────────────────────────────────────────────────── */
  const { data: sessions = [], isLoading: loadingSessions } = useQuery<SessionRow[]>({
    queryKey: ["coach_student_sessions", studentId],
    enabled:  !!studentId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await sb
        .from("workout_sessions")
        .select("id, workout_key, workout_label, started_at, ended_at, general_feeling, sleep_quality, is_deload_week")
        .eq("user_id", studentId)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  /* ── Séries dos últimos 30 dias ───────────────────────────────────────────── */
  const { data: allSets = [], isLoading: loadingSets } = useQuery<SetRow[]>({
    queryKey: ["coach_student_sets", studentId],
    enabled:  !!studentId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from("workout_sets")
        .select("exercise_name, exercise_key, muscle_group, set_number, weight_kg, reps, perceived_effort, executed_at")
        .eq("user_id", studentId)
        .eq("completed", true)
        .eq("skipped", false)
        .gte("executed_at", since)
        .order("executed_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SetRow[];
    },
  });

  /* ── Alertas de fadiga não lidos ─────────────────────────────────────────── */
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

  /* ── Mutation: marcar alerta como lido ───────────────────────────────────── */
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

  /* ── Processamento dos dados ─────────────────────────────────────────────── */

  // Exercícios únicos (para o seletor de progressão de carga)
  const uniqueExercises: { key: string; name: string }[] = [];
  const seenKeys = new Set<string>();
  for (const s of allSets) {
    if (!seenKeys.has(s.exercise_key)) {
      seenKeys.add(s.exercise_key);
      uniqueExercises.push({ key: s.exercise_key, name: s.exercise_name });
    }
  }

  const [selectedExKey, setSelectedExKey] = useState<string>(() => uniqueExercises[0]?.key ?? "");

  // Progressão de carga do exercício selecionado (série 1 de cada dia)
  const loadProgressionData = allSets
    .filter((s) => s.exercise_key === (selectedExKey || uniqueExercises[0]?.key) && s.set_number === 1 && s.weight_kg != null)
    .map((s) => ({
      date:   fmtDate(s.executed_at),
      carga:  s.weight_kg ?? 0,
      reps:   s.reps ?? 0,
      effort: s.perceived_effort ?? 0,
    }));

  // Volume semanal: nº de séries por dia da última semana
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const volumeData = last7.map((dateStr) => {
    const daySets = allSets.filter((s) => s.executed_at.slice(0, 10) === dateStr);
    return {
      date:   new Date(dateStr).toLocaleDateString("pt-BR", { weekday: "short" }),
      séries: daySets.length,
      falhas: daySets.filter((s) => s.perceived_effort === 3).length,
    };
  });

  // Adesão: sessões concluídas nos últimos 30 dias
  const adherenceRate = sessions.length > 0
    ? Math.round((sessions.filter((s) => s.ended_at).length / Math.min(sessions.length, 12)) * 100)
    : 0;

  // Média de sentimento e sono
  const feelingAvg = sessions.filter((s) => s.general_feeling).length > 0
    ? (sessions.reduce((a, s) => a + (s.general_feeling ?? 0), 0) / sessions.filter((s) => s.general_feeling).length).toFixed(1)
    : "—";
  const sleepAvg = sessions.filter((s) => s.sleep_quality).length > 0
    ? (sessions.reduce((a, s) => a + (s.sleep_quality ?? 0), 0) / sessions.filter((s) => s.sleep_quality).length).toFixed(1)
    : "—";

  // Total de séries e peso total movido (estimativa)
  const totalSets   = allSets.length;
  const totalWeight = allSets.reduce((a, s) => a + ((s.weight_kg ?? 0) * (s.reps ?? 0)), 0);

  const unreadAlerts = alerts.filter((a) => !a.is_read);
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" && !a.is_read);

  const isLoading = loadingSessions || loadingSets || loadingAlerts;

  /* ── Render ─────────────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Carregando dados de {studentName}…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Alertas de fadiga ──────────────────────────────────────────────────── */}
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
              <Badge style={{ background: criticalAlerts.length > 0 ? RED + "22" : GOLD + "22", color: criticalAlerts.length > 0 ? RED : GOLD, border: "none" }}>
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
                          <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: alert.severity === "critical" ? RED : GOLD }}>
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
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pl-7"
                        >
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

      {/* ── Sem dados ──────────────────────────────────────────────────────────── */}
      {sessions.length === 0 && allSets.length === 0 && (
        <div className="rounded-xl p-8 text-center space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Dumbbell className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhum treino registrado pelo aluno ainda.</p>
          <p className="text-xs text-muted-foreground/60">Os dados aparecem aqui assim que o aluno usar o Modo Treino.</p>
        </div>
      )}

      {(sessions.length > 0 || allSets.length > 0) && (
        <>
          {/* ── Cards de estatísticas ─────────────────────────────────────────── */}
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
              label="Séries (30d)"
              value={totalSets}
              sub={`${Math.round(totalWeight / 1000)}t levantadas`}
              color={BLUE}
            />
            <StatCard
              icon={<Smile className="w-3.5 h-3.5" />}
              label="Sentimento"
              value={feelingAvg !== "—" ? `${FEELING_EMOJI[Math.round(Number(feelingAvg))]} ${feelingAvg}` : "—"}
              sub="média das sessões"
            />
            <StatCard
              icon={<Moon className="w-3.5 h-3.5" />}
              label="Sono"
              value={sleepAvg !== "—" ? `${SLEEP_EMOJI[Math.round(Number(sleepAvg))]} ${sleepAvg}` : "—"}
              sub="média das sessões"
            />
          </div>

          {/* ── Abas: Progressão · Volume · Sessões ──────────────────────────── */}
          <Tabs defaultValue="load">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="load">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                Carga
              </TabsTrigger>
              <TabsTrigger value="volume">
                <Activity className="w-3.5 h-3.5 mr-1.5" />
                Volume
              </TabsTrigger>
              <TabsTrigger value="sessions">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Sessões
              </TabsTrigger>
            </TabsList>

            {/* ── ABA: Progressão de Carga ────────────────────────────────────── */}
            <TabsContent value="load" className="space-y-3 mt-3">
              {uniqueExercises.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum dado de carga disponível ainda.</p>
              ) : (
                <>
                  {/* Seletor de exercício */}
                  <div className="flex gap-1.5 flex-wrap">
                    {uniqueExercises.slice(0, 8).map((ex) => (
                      <button key={ex.key} type="button"
                        onClick={() => setSelectedExKey(ex.key)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition"
                        style={
                          (selectedExKey || uniqueExercises[0]?.key) === ex.key
                            ? { background: GOLD + "22", borderColor: GOLD, color: GOLD }
                            : { background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }
                        }
                      >
                        {ex.name.split(" ").slice(0, 2).join(" ")}
                      </button>
                    ))}
                  </div>

                  {loadProgressionData.length < 2 ? (
                    <div className="rounded-xl p-6 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="text-xs text-muted-foreground">Mínimo 2 sessões para exibir progressão.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-4">
                        Progressão de carga — {uniqueExercises.find((e) => e.key === (selectedExKey || uniqueExercises[0]?.key))?.name}
                      </p>
                      <ResponsiveContainer width="100%" height={180}>
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

                      {/* Delta último treino */}
                      {loadProgressionData.length >= 2 && (() => {
                        const last   = loadProgressionData.at(-1)!;
                        const prev   = loadProgressionData.at(-2)!;
                        const delta  = last.carga - prev.carga;
                        const pct    = prev.carga > 0 ? ((delta / prev.carga) * 100).toFixed(1) : "—";
                        return (
                          <div className="mt-3 flex items-center gap-3 pt-3 border-t border-white/5">
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Última</p>
                              <p className="text-sm font-black text-white">{last.carga}kg × {last.reps} reps</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Variação</p>
                              <p className="text-sm font-black" style={{ color: delta > 0 ? GREEN : delta < 0 ? RED : "rgba(255,255,255,0.6)" }}>
                                {delta > 0 ? "+" : ""}{delta}kg ({pct}%)
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── ABA: Volume Semanal ─────────────────────────────────────────── */}
            <TabsContent value="volume" className="space-y-3 mt-3">
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-4">
                  Volume semanal (séries por dia)
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={volumeData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }} />
                    <Bar dataKey="séries" fill={BLUE} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="falhas" fill={RED}  radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribuição de esforço */}
              {allSets.length > 0 && (() => {
                const total  = allSets.length;
                const limpos = allSets.filter((s) => s.perceived_effort === 1).length;
                const pesados = allSets.filter((s) => s.perceived_effort === 2).length;
                const falhas = allSets.filter((s) => s.perceived_effort === 3).length;
                const noRpe  = total - limpos - pesados - falhas;
                return (
                  <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Distribuição de esforço (30d)
                    </p>
                    {[
                      { label: "✅ Limpo (RIR 3+)",   count: limpos,  color: GREEN, pct: Math.round((limpos / total) * 100) },
                      { label: "🔥 Pesado (RIR 1-2)", count: pesados, color: GOLD,  pct: Math.round((pesados / total) * 100) },
                      { label: "💀 Falhei (RIR 0)",   count: falhas,  color: RED,   pct: Math.round((falhas / total) * 100) },
                    ].map((row) => (
                      <div key={row.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span style={{ color: row.color }}>{row.label}</span>
                          <span className="text-white/60 font-bold">{row.count} ({row.pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: row.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${row.pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    ))}
                    {noRpe > 0 && (
                      <p className="text-[10px] text-muted-foreground">{noRpe} séries sem RPE registrado.</p>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

            {/* ── ABA: Sessões recentes ───────────────────────────────────────── */}
            <TabsContent value="sessions" className="space-y-2 mt-3">
              {sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhuma sessão registrada ainda.</p>
              ) : (
                sessions.map((s) => {
                  const duration = fmtDuration(s.started_at, s.ended_at);
                  const feeling  = s.general_feeling;
                  const sleep    = s.sleep_quality;
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl p-3 flex items-center gap-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
                        style={{ background: "rgba(255,255,255,0.06)", color: GOLD }}
                      >
                        {s.workout_key}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {s.workout_label ? `${s.workout_key} · ${s.workout_label}` : `Treino ${s.workout_key}`}
                          {s.is_deload_week && (
                            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: BLUE + "22", color: BLUE }}>
                              Deload
                            </span>
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
                      <div className="flex items-center gap-2 shrink-0">
                        {feeling && (
                          <span title={`Sentimento: ${["", "Pesado", "Bom", "Top"][feeling]}`} className="text-base">
                            {FEELING_EMOJI[feeling]}
                          </span>
                        )}
                        {sleep && (
                          <span title={`Sono: ${["", "Mal", "Normal", "Bem"][sleep]}`} className="text-base">
                            {SLEEP_EMOJI[sleep]}
                          </span>
                        )}
                        {s.ended_at && (
                          <CheckCircle2 className="w-4 h-4" style={{ color: GREEN }} />
                        )}
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
