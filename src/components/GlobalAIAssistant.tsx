// src/components/GlobalAIAssistant.tsx
import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FitnessChatBot } from "@/components/fitness/FitnessChatBot";
import { supabase } from "@/integrations/supabase/client";

const HIDDEN_ROUTES = new Set(["/", "/auth", "/admin-login", "/student", "/anamnesis", "/workout-plan"]);

/** Retorna data/hora atual do browser do usuário — nunca do servidor */
function getCurrentDateContext() {
  const now = new Date();
  const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  return {
    dataAtual: now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    diaSemana: diasSemana[now.getDay()],
    horaAtual: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

async function fetchAthleteContext() {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return undefined;

  const [profileRes, roleRes] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
  ]);

  const userRole = roleRes.data?.role;
  const isCoach = userRole === "coach" || userRole === "admin";

  if (isCoach) {
    // Tabela correta: coach_students (não coach_student_links, que não existe
    // no schema — causava contexto de IA do coach sempre vazio).
    const [linksRes, templatesRes] = await Promise.all([
      supabase
        .from("coach_students")
        .select("student_id")
        .eq("coach_id", uid)
        .eq("status", "active")
        .limit(8),
      supabase
        .from("protocols")
        .select("name, updated_at")
        .eq("coach_id", uid)
        .eq("is_template", true)
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

    if (linksRes.error) console.error("[AI context] coach_students:", linksRes.error.message);
    if (templatesRes.error) console.error("[AI context] protocols:", templatesRes.error.message);

    const studentIds = (linksRes.data ?? []).map((l) => l.student_id);

    const [profilesRes, plansRes, checkinsRes] = await Promise.all([
      studentIds.length
        ? supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      studentIds.length
        ? supabase.from("coach_plans").select("student_id, goal, calories").in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      studentIds.length
        ? supabase
            .from("check_ins")
            .select("student_id, submitted_at, coach_feedback")
            .in("student_id", studentIds)
            .order("submitted_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const nameById = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.full_name]));
    const planById = new Map((plansRes.data ?? []).map((p) => [p.student_id, p]));

    return {
      name: profileRes.data?.full_name,
      isCoach: true,
      ...getCurrentDateContext(),
      coachContext: {
        totalStudents: studentIds.length,
        students: studentIds.map((sid) => ({
          name: nameById.get(sid),
          goal: planById.get(sid)?.goal,
          calories: planById.get(sid)?.calories,
        })),
        recentCheckins: (checkinsRes.data ?? []).map((c) => ({
          studentName: nameById.get(c.student_id),
          date: c.submitted_at,
          hasFeedback: !!c.coach_feedback,
        })),
        savedTemplates: (templatesRes.data ?? []).map((t) => t.name),
        platformCapabilities: [
          "Construtor de protocolo com dieta por macros (carbo/proteína/gordura)",
          "Opções de substituição por refeição",
          "Ciclo de carboidrato (alto/base/baixo)",
          "Check-in quinzenal com fotos e métricas",
          "Comparação de evolução com fotos lado a lado",
          "Lista de compras gerada automaticamente",
          "Suplementação por refeição",
          "Periodização de treino semanal",
        ],
      },
    };
  }

  const [plan, anam, checkins, measure, skin, protocol] = await Promise.all([
    supabase.from("coach_plans").select("goal,calories,protein_g,carbs_g,fat_g,water_l,notes").eq("student_id", uid).maybeSingle(),
    supabase.from("anamnesis").select("baseline_metrics,payload,submitted_at").eq("student_id", uid).maybeSingle(),
    supabase.from("check_ins").select("current_metrics,coach_feedback,submitted_at").eq("student_id", uid).order("submitted_at", { ascending: false }).limit(3),
    supabase.from("body_measurements").select("weight,measurement_date").eq("user_id", uid).order("measurement_date", { ascending: false }).limit(1),
    supabase.from("skinfold_measurements").select("body_fat_percentage,measurement_date").eq("user_id", uid).order("measurement_date", { ascending: false }).limit(1),
    supabase.from("protocols").select("name,payload").eq("student_id", uid).eq("active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Últimas atualizações do coach (protocol_change_events) — usadas pela IA
  // pra responder "quais foram as últimas atualizações do meu coach".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatesRes = await (supabase as any)
    .from("protocol_change_events")
    .select("id, changes, created_at, seen_at")
    .eq("student_id", uid)
    .order("created_at", { ascending: false })
    .limit(5);
  const recentCoachUpdates = (updatesRes.data ?? []).flatMap((row: any) => {
    const date = row.created_at ? row.created_at.slice(0, 10) : null;
    const changes = Array.isArray(row.changes) ? row.changes : [];
    return changes.map((c: any) => ({
      date,
      label: c?.label ?? "",
      category: c?.category ?? "geral",
      seen: !!row.seen_at,
    }));
  });

  return {
    name: profileRes.data?.full_name,
    isCoach: false,
    ...getCurrentDateContext(),
    plan: plan.data ?? null,
    anamnesis: anam.data?.payload ?? null,
    baselineMetrics: anam.data?.baseline_metrics ?? null,
    recentCheckIns: checkins.data ?? [],
    latestMeasurements: measure.data?.[0] ?? null,
    latestSkinfolds: skin.data?.[0] ?? null,
    activeProtocol: protocol.data ? { name: protocol.data.name, payload: protocol.data.payload } : null,
    recentCoachUpdates,
  };
}

export const GlobalAIAssistant = () => {
  const { pathname } = useLocation();
  const [chatOpened, setChatOpened] = useState(false);
  const [proactiveMessage, setProactiveMessage] = useState<string | undefined>(undefined);

  const { data: ctx } = useQuery({
    queryKey: ["ai-athlete-context"],
    queryFn: fetchAthleteContext,
    enabled: chatOpened,
    staleTime: 2 * 60_000,
  });

  const handleChatOpen = useCallback(() => setChatOpened(true), []);

  // Query leve para detectar feedback novo do coach, mesmo com o chat fechado.
  // Não roda em rotas ocultas e dispara só uma vez por sessão (guarda no effect).
  const hidden = HIDDEN_ROUTES.has(pathname);
  const { data: proactiveCheck } = useQuery({
    queryKey: ["ai-proactive-triggers"],
    enabled: !hidden && !sessionStorage.getItem("ai-proactive-seen"),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return null;
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
      if (role?.role === "coach" || role?.role === "admin") return null;
      const [ciRes, streakRes, wsRes] = await Promise.all([
        supabase
          .from("check_ins")
          .select("coach_feedback, submitted_at")
          .eq("student_id", uid)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("get_checkin_streak", { p_student_id: uid }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("workout_sessions")
          .select("ended_at")
          .eq("user_id", uid)
          .not("ended_at", "is", null)
          .order("ended_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const lastCheckin = ciRes.data?.submitted_at ? new Date(ciRes.data.submitted_at) : null;
      const lastWorkout = wsRes.data?.ended_at ? new Date(wsRes.data.ended_at) : null;
      const daysSinceLastCheckin = lastCheckin
        ? Math.floor((Date.now() - lastCheckin.getTime()) / 86_400_000)
        : null;
      const daysSinceLastWorkout = lastWorkout
        ? Math.floor((Date.now() - lastWorkout.getTime()) / 86_400_000)
        : null;
      return {
        coachFeedback: ciRes.data?.coach_feedback ?? null,
        checkinSubmittedAt: ciRes.data?.submitted_at ?? null,
        checkinStreak: typeof streakRes.data === "number" ? streakRes.data : 0,
        daysSinceLastCheckin,
        daysSinceLastWorkout,
      };
    },
  });

  useEffect(() => {
    if (!proactiveCheck) return;
    const seenKey = "ai-proactive-seen";
    if (sessionStorage.getItem(seenKey)) return;

    // Ordem de prioridade: feedback novo > reforço positivo > recuperação
    const {
      coachFeedback,
      checkinStreak = 0,
      daysSinceLastCheckin,
      daysSinceLastWorkout,
    } = proactiveCheck;

    let msg: string | null = null;
    if (coachFeedback) {
      msg = "Seu coach deixou um feedback no seu último check-in! Quer que eu faça um resumo pra você?";
    } else if (checkinStreak >= 3 && daysSinceLastCheckin != null && daysSinceLastCheckin >= 12) {
      msg = `Você já tem ${checkinStreak} check-ins seguidos 🔥 Falta pouco pro próximo — quer que eu revise o que ajustar agora?`;
    } else if (daysSinceLastWorkout != null && daysSinceLastWorkout >= 3) {
      msg = `Faz ${daysSinceLastWorkout} dias sem treino registrado. Quer ajuda pra remontar a semana e voltar sem sobrecarregar?`;
    }

    if (msg) {
      sessionStorage.setItem(seenKey, "1");
      setProactiveMessage(msg);
    }
  }, [proactiveCheck]);

  if (HIDDEN_ROUTES.has(pathname)) return null;
  return <FitnessChatBot athleteContext={ctx} onOpen={handleChatOpen} proactiveMessage={proactiveMessage} />;
};
