import { useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FitnessChatBot } from "@/components/fitness/FitnessChatBot";
import { supabase } from "@/integrations/supabase/client";

const HIDDEN_ROUTES = new Set(["/", "/auth", "/admin-login", "/student", "/anamnesis"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

async function fetchAthleteContext() {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return undefined;

  const [profile, roleReq] = await Promise.all([
    sb.from("profiles").select("full_name").eq("user_id", uid).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
  ]);

  const userRole = roleReq?.data?.role;
  const isCoach = userRole === "coach" || userRole === "admin";

  if (isCoach) {
    // Caps reduzidos: 8 alunos / 5 check-ins / 3 templates — protege custo de
    // tokens de IA por mensagem sem perder contexto útil para o coach.
    const [students, recentCheckins, templates] = await Promise.all([
      sb.from("coach_student_links")
        .select("student_id, profiles!inner(full_name), coach_plans(goal, calories)")
        .eq("coach_id", uid)
        .eq("active", true)
        .limit(8),
      sb.from("check_ins")
        .select("student_id, submitted_at, coach_feedback, profiles!inner(full_name)")
        .order("submitted_at", { ascending: false })
        .limit(5),
      sb.from("protocols")
        .select("name, updated_at")
        .eq("coach_id", uid)
        .eq("is_template", true)
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

    return {
      name: profile?.data?.full_name,
      isCoach: true,
      coachContext: {
        totalStudents: students?.data?.length ?? 0,
        students: (students?.data ?? []).map((s: any) => ({
          name: s.profiles?.full_name,
          goal: s.coach_plans?.[0]?.goal,
          calories: s.coach_plans?.[0]?.calories,
        })),
        recentCheckins: (recentCheckins?.data ?? []).map((c: any) => ({
          studentName: c.profiles?.full_name,
          date: c.submitted_at,
          hasFeedback: !!c.coach_feedback,
        })),
        savedTemplates: (templates?.data ?? []).map((t: any) => t.name),
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
    sb.from("coach_plans").select("goal,calories,protein_g,carbs_g,fat_g,water_l,notes").eq("student_id", uid).maybeSingle(),
    sb.from("anamnesis").select("baseline_metrics,payload,submitted_at").eq("student_id", uid).maybeSingle(),
    sb.from("check_ins").select("current_metrics,coach_feedback,submitted_at").eq("student_id", uid).order("submitted_at", { ascending: false }).limit(3),
    sb.from("body_measurements").select("weight,measurement_date").eq("user_id", uid).order("measurement_date", { ascending: false }).limit(1),
    sb.from("skinfold_measurements").select("body_fat_percentage,measurement_date").eq("user_id", uid).order("measurement_date", { ascending: false }).limit(1),
    sb.from("protocols").select("name,payload").eq("student_id", uid).eq("active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    name: profile?.data?.full_name,
    isCoach: false,
    plan: plan?.data ?? null,
    anamnesis: anam?.data?.payload ?? null,
    baselineMetrics: anam?.data?.baseline_metrics ?? null,
    recentCheckIns: checkins?.data ?? [],
    latestMeasurements: measure?.data?.[0] ?? null,
    latestSkinfolds: skin?.data?.[0] ?? null,
    activeProtocol: protocol?.data ? { name: protocol.data.name, payload: protocol.data.payload } : null,
  };
}

export const GlobalAIAssistant = () => {
  const { pathname } = useLocation();
  const [chatOpened, setChatOpened] = useState(false);

  // O contexto só é buscado quando o usuário efetivamente abre o chat —
  // antes disso, nenhuma query Supabase é disparada por troca de rota.
  const { data: ctx } = useQuery({
    queryKey: ["ai-athlete-context"],
    queryFn: fetchAthleteContext,
    enabled: chatOpened,
    staleTime: 2 * 60_000, // evita refetch a cada reabertura dentro de 2min
  });

  const handleChatOpen = useCallback(() => setChatOpened(true), []);

  if (HIDDEN_ROUTES.has(pathname)) return null;
  return <FitnessChatBot athleteContext={ctx} onOpen={handleChatOpen} />;
};
