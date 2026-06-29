// src/pages/Onboarding.tsx
// Primeira tela pós-login para alunos novos.
// Exibida quando student_profiles.onboarding_completed = false.
// Melhorias v2:
//  - Steps animados com Framer Motion (progress pill visual)
//  - Verificação de coach via coach_students E coach_plans (mais robusta)
//  - Card de benefícios do protocolo com ícones
//  - Guard duplo: onboarding_completed E anamnese já submetida → /student-area

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, ArrowRight, ClipboardList, Camera, LayoutDashboard,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Steps do onboarding ───────────────────────────────────────────────────
const STEPS = [
  {
    icon:  ClipboardList,
    title: "Anamnese",
    desc:  "Histórico de saúde, objetivos e rotina. Leva menos de 5 minutos.",
    color: "text-primary",
    bg:    "bg-primary/10",
  },
  {
    icon:  Camera,
    title: "Fotos de avaliação",
    desc:  "Registro inicial para acompanharmos sua evolução visual. Opcional.",
    color: "text-blue-500",
    bg:    "bg-blue-500/10",
  },
  {
    icon:  LayoutDashboard,
    title: "Painel liberado",
    desc:  "Acesso ao protocolo personalizado, treino e dieta do seu coach.",
    color: "text-emerald-500",
    bg:    "bg-emerald-500/10",
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState<string | null>(null);
  const [teamName,  setTeamName]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { navigate("/auth"); return; }

      // Guard 1: onboarding já marcado como completo
      const { data: sp } = await supabase
        .from("student_profiles")
        .select("onboarding_completed")
        .eq("user_id", uid)
        .maybeSingle();
      if (sp?.onboarding_completed) {
        navigate("/student-area", { replace: true });
        return;
      }

      // Guard 2: anamnese já submetida (aluno voltou à rota por acidente)
      const { data: ana } = await supabase
        .from("anamnesis")
        .select("submitted_at")
        .eq("student_id", uid)
        .maybeSingle();
      if (ana?.submitted_at) {
        navigate("/student-area", { replace: true });
        return;
      }

      // Busca coach: tenta coach_students primeiro (mais atualizado),
      // fallback para coach_plans (compatibilidade com fluxos antigos)
      let coachId: string | null = null;

      const { data: link } = await supabase
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", uid)
        .eq("status", "active")
        .maybeSingle();
      coachId = link?.coach_id ?? null;

      if (!coachId) {
        const { data: plan } = await supabase
          .from("coach_plans")
          .select("coach_id")
          .eq("student_id", uid)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        coachId = plan?.coach_id ?? null;
      }

      if (coachId) {
        const { data: coach } = await supabase
          .from("profiles")
          .select("full_name, team_name")
          .eq("user_id", coachId)
          .maybeSingle();
        setCoachName(coach?.full_name ?? null);
        setTeamName(coach?.team_name  ?? null);
      }

      setLoading(false);
    })();
  }, [navigate]);

  // Auto-avança os steps a cada 2s para engajar enquanto o aluno lê
  useEffect(() => {
    if (loading) return;
    const id = window.setInterval(() => {
      setActiveStep((s) => (s + 1) % STEPS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-sm w-full space-y-6"
      >
        {/* Ícone principal */}
        <div className="flex flex-col items-center text-center space-y-3">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 10, stiffness: 120 }}
            className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
          >
            <Zap className="w-8 h-8 text-primary" />
          </motion.div>

          <div>
            <h1 className="text-2xl font-black text-foreground">
              {teamName ? `Bem-vindo à ${teamName}!` : "Bem-vindo! 👋"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              {coachName ? (
                <>
                  Seu coach{" "}
                  <span className="text-foreground font-semibold">{coachName}</span>{" "}
                  está esperando suas respostas para montar o protocolo ideal para você.
                </>
              ) : (
                "Preencha sua anamnese para liberar o acesso ao seu protocolo personalizado."
              )}
            </p>
          </div>
        </div>

        {/* Progress pills */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === activeStep ? "24px" : "8px", opacity: i === activeStep ? 1 : 0.3 }}
              transition={{ duration: 0.3 }}
              className="h-2 rounded-full bg-primary"
            />
          ))}
        </div>

        {/* Steps animados */}
        <div className="relative" style={{ minHeight: 96 }}>
          <AnimatePresence mode="wait">
            {STEPS.map((step, i) =>
              i === activeStep ? (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 flex items-center gap-4 bg-card border border-border/50 rounded-xl p-4"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${step.bg}`}>
                    <step.icon className={`w-6 h-6 ${step.color}`} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">
                      <span className="text-muted-foreground font-normal text-xs mr-1.5">{i + 1} de {STEPS.length}</span>
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              ) : null
            )}
          </AnimatePresence>
        </div>

        {/* Checklist rápida */}
        <div className="bg-card border border-border/40 rounded-xl p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            O que você vai fornecer
          </p>
          {[
            "Objetivos e histórico de saúde",
            "Frequência e disponibilidade de treino",
            "Restrições alimentares ou lesões",
            "Fotos de avaliação (opcional)",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-primary/50 shrink-0" />
              <span className="text-sm text-foreground/80">{item}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Button
          onClick={() => navigate("/anamnesis")}
          className="w-full h-12 text-base font-bold rounded-2xl gap-2"
          style={{ background: "linear-gradient(135deg, #CC0000, #8B0000)", color: "#fff" }}
        >
          Começar anamnese
          <ArrowRight className="w-4 h-4" />
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Leva menos de 5 minutos · seus dados são privados
        </p>
      </motion.div>
    </div>
  );
}
