import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FitnessChatBot } from "@/components/fitness/FitnessChatBot";
import { supabase } from "@/integrations/supabase/client";

const HIDDEN_ROUTES = new Set(["/", "/auth", "/admin-login", "/student", "/anamnesis"]);

export const GlobalAIAssistant = () => {
  const { pathname } = useLocation();
  const [ctx, setCtx] = useState<any>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) { if (!cancelled) setCtx(undefined); return; }
      
      const sb: any = supabase;
      const [profile, roleReq] = await Promise.all([
        sb.from("profiles").select("full_name,email").eq("user_id", uid).maybeSingle(),
        sb.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
      ]);

      if (cancelled) return;

      const userRole = roleReq?.data?.role;
      const isCoach = userRole === 'coach' || userRole === 'admin';

      if (isCoach) {
        const [students, recentCheckins, templates] = await Promise.all([
          sb.from("coach_student_links")
            .select("student_id, profiles!inner(full_name), coach_plans(goal, calories, protein_g, carbs_g, fat_g)")
            .eq("coach_id", uid)
            .eq("active", true)
            .limit(20),
          sb.from("check_ins")
            .select("student_id, submitted_at, current_metrics, coach_feedback, profiles!inner(full_name)")
            .order("submitted_at", { ascending: false })
            .limit(10),
          sb.from("protocols")
            .select("name, updated_at")
            .eq("coach_id", uid)
            .eq("is_template", true)
            .order("updated_at", { ascending: false })
            .limit(5),
        ]);

        if (cancelled) return;

        setCtx({
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
              metrics: c.current_metrics,
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
        });
      } else {
        const [plan, anam, checkins, measure, skin, protocol] = await Promise.all([
          sb.from("coach_plans").select("*").eq("student_id", uid).maybeSingle(),
          sb.from("anamnesis").select("baseline_metrics,payload,submitted_at").eq("student_id", uid).maybeSingle(),
          sb.from("check_ins").select("current_metrics,coach_feedback,submitted_at").eq("student_id", uid).order("submitted_at", { ascending: false }).limit(3),
          sb.from("body_measurements").select("*").eq("user_id", uid).order("measurement_date", { ascending: false }).limit(1),
          sb.from("skinfold_measurements").select("*").eq("user_id", uid).order("measurement_date", { ascending: false }).limit(1),
          sb.from("protocols").select("name,payload").eq("student_id", uid).eq("active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        if (cancelled) return;

        setCtx({
          name: profile?.data?.full_name,
          isCoach: false,
          plan: plan?.data ? {
            goal: plan.data.goal,
            calories: plan.data.calories,
            protein_g: plan.data.protein_g,
            carbs_g: plan.data.carbs_g,
            fat_g: plan.data.fat_g,
            water_l: plan.data.water_l,
            notes: plan.data.notes,
          } : null,
          anamnesis: anam?.data?.payload ?? null,
          baselineMetrics: anam?.data?.baseline_metrics ?? null,
          recentCheckIns: checkins?.data ?? [],
          latestMeasurements: measure?.data?.[0] ?? null,
          latestSkinfolds: skin?.data?.[0] ?? null,
          activeProtocol: protocol?.data ? { name: protocol.data.name, payload: protocol.data.payload } : null,
        });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pathname]);

  if (HIDDEN_ROUTES.has(pathname)) return null;
  return <FitnessChatBot athleteContext={ctx} />;
};
