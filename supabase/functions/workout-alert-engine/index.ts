// workout-alert-engine
// Motor DETERMINÍSTICO de alertas de treino. Sem IA: apenas regras sobre
// workout_sessions / workout_sets. Grava em coach_fatigue_alerts, que já
// alimenta o painel do coach e a fila de prioridade.
//
// Body: { studentId: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type Severity = "info" | "warning" | "critical";
interface Candidate {
  alert_type: string;
  severity: Severity;
  message: string;
  suggestion: string | null;
  context: Record<string, unknown>;
}

const DAY = 24 * 60 * 60 * 1000;

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const studentId = (body?.studentId as string) || user.id;

    // Autorização: o próprio aluno, o coach vinculado ou admin.
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: link } = await admin
      .from("coach_students")
      .select("coach_id")
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();
    const coachId = link?.coach_id as string | undefined;
    const allowed = user.id === studentId || !!isAdmin || (!!coachId && coachId === user.id);
    if (!allowed) throw new Error("Acesso negado");
    if (!coachId) {
      return new Response(JSON.stringify({ ok: true, skipped: "sem_coach" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since28 = new Date(Date.now() - 28 * DAY).toISOString();
    const [{ data: sessions }, { data: sets }] = await Promise.all([
      admin.from("workout_sessions")
        .select("id, started_at, ended_at, general_feeling, sleep_quality, is_deload_week")
        .eq("user_id", studentId)
        .gte("started_at", since28)
        .order("started_at", { ascending: false }),
      admin.from("workout_sets")
        .select("session_id, exercise_key, exercise_name, set_number, weight_kg, reps, perceived_effort, executed_at, completed, skipped")
        .eq("user_id", studentId)
        .eq("completed", true)
        .gte("executed_at", since28)
        .order("executed_at", { ascending: true }),
    ]);

    const S = sessions ?? [];
    const X = (sets ?? []).filter((s) => !s.skipped);
    const candidates: Candidate[] = [];

    // 1) Baixa assiduidade: < 3 sessões nos últimos 14 dias.
    const last14 = S.filter((s) => new Date(s.started_at).getTime() >= Date.now() - 14 * DAY);
    if (last14.length < 3) {
      candidates.push({
        alert_type: "low_adherence",
        severity: last14.length === 0 ? "critical" : "warning",
        message: `Apenas ${last14.length} treino(s) registrado(s) nos últimos 14 dias.`,
        suggestion: "Confirme com o aluno se houve pausa, lesão ou dificuldade de rotina antes de ajustar o protocolo.",
        context: { sessions14d: last14.length },
      });
    }

    // 2) RPE alto sustentado: >= 40% das séries dos últimos 7 dias com esforço 3 (falha).
    const last7Sets = X.filter((s) => new Date(s.executed_at).getTime() >= Date.now() - 7 * DAY);
    const failed = last7Sets.filter((s) => s.perceived_effort === 3).length;
    if (last7Sets.length >= 10 && failed / last7Sets.length >= 0.4) {
      candidates.push({
        alert_type: "high_rpe",
        severity: "warning",
        message: `${Math.round((failed / last7Sets.length) * 100)}% das séries da última semana terminaram em falha.`,
        suggestion: "Reduzir a proximidade da falha (RIR 2-3) ou diminuir o volume das séries finais.",
        context: { failedSets: failed, totalSets: last7Sets.length },
      });
    }

    // 3) Sono ruim recorrente: média <= 2 nas últimas 4 sessões avaliadas.
    const sleepVals = S.filter((s) => s.sleep_quality != null).slice(0, 4).map((s) => s.sleep_quality as number);
    if (sleepVals.length >= 3) {
      const avg = sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length;
      if (avg <= 2) {
        candidates.push({
          alert_type: "poor_sleep",
          severity: "info",
          message: `Qualidade de sono média baixa (${avg.toFixed(1)}/4) nas últimas sessões.`,
          suggestion: "Investigar rotina de sono e estresse antes de aumentar carga ou volume.",
          context: { avgSleep: Number(avg.toFixed(2)), samples: sleepVals.length },
        });
      }
    }

    // 4) Estagnação: mesma carga máxima em 3+ sessões seguidas de um exercício.
    const byEx = new Map<string, { name: string; perSession: Map<string, number> }>();
    for (const s of X) {
      if (s.weight_kg == null) continue;
      if (!byEx.has(s.exercise_key)) byEx.set(s.exercise_key, { name: s.exercise_name, perSession: new Map() });
      const e = byEx.get(s.exercise_key)!;
      const prev = e.perSession.get(s.session_id) ?? 0;
      if (s.weight_kg > prev) e.perSession.set(s.session_id, s.weight_kg);
    }
    const stagnant: string[] = [];
    for (const [, e] of byEx) {
      const loads = Array.from(e.perSession.values());
      if (loads.length < 3) continue;
      const lastThree = loads.slice(-3);
      if (lastThree.every((v) => v === lastThree[0])) stagnant.push(e.name);
    }
    if (stagnant.length > 0) {
      candidates.push({
        alert_type: "stagnation",
        severity: "info",
        message: `Carga estável há 3+ sessões em: ${stagnant.slice(0, 4).join(", ")}.`,
        suggestion: "Aplicar progressão (carga, reps ou densidade) ou trocar a variação do exercício.",
        context: { exercises: stagnant.slice(0, 8) },
      });
    }

    // 5) Overreaching: RPE alto + sono ruim simultâneos.
    if (candidates.some((c) => c.alert_type === "high_rpe") && candidates.some((c) => c.alert_type === "poor_sleep")) {
      candidates.push({
        alert_type: "overreaching",
        severity: "critical",
        message: "Combinação de esforço máximo frequente e sono ruim — risco de overreaching.",
        suggestion: "Considerar semana de deload (redução de ~40% do volume) e reavaliar recuperação.",
        context: {},
      });
    }

    // Antiduplicação: ignora tipos já abertos ou criados nos últimos 7 dias.
    const { data: recent } = await admin
      .from("coach_fatigue_alerts")
      .select("alert_type, created_at, resolved_at")
      .eq("coach_id", coachId)
      .eq("student_id", studentId)
      .gte("created_at", new Date(Date.now() - 7 * DAY).toISOString());
    const blocked = new Set((recent ?? []).map((r) => r.alert_type));

    const toInsert = candidates
      .filter((c) => !blocked.has(c.alert_type))
      .map((c) => ({
        coach_id: coachId,
        student_id: studentId,
        alert_type: c.alert_type,
        severity: c.severity,
        message: c.message,
        suggestion: c.suggestion,
        context: c.context,
        is_read: false,
      }));

    if (toInsert.length > 0) {
      const { error } = await admin.from("coach_fatigue_alerts").insert(toInsert);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, created: toInsert.length, evaluated: candidates.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[workout-alert-engine]", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
