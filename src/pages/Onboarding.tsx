// src/pages/Onboarding.tsx
// Primeira tela pós-login para alunos novos.
// Exibida quando student_profiles.onboarding_completed = false.
// Ao clicar em "Começar anamnese", redireciona para /anamnesis.
// O submit da anamnese marca onboarding_completed = true no banco.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Onboarding = () => {
  const navigate = useNavigate();
  const [coachName, setCoachName] = useState<string | null>(null);
  const [teamName, setTeamName]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { navigate("/auth"); return; }

      // Verifica se já concluiu onboarding (proteção contra acesso direto à rota)
      const { data: sp } = await supabase
        .from("student_profiles")
        .select("onboarding_completed")
        .eq("user_id", uid)
        .maybeSingle();

      if (sp?.onboarding_completed) {
        navigate("/student-area", { replace: true });
        return;
      }

      // Busca coach vinculado para personalizar boas-vindas
      const { data: plan } = await supabase
        .from("coach_plans")
        .select("coach_id")
        .eq("student_id", uid)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (plan?.coach_id) {
        const { data: coach } = await supabase
          .from("profiles")
          .select("full_name, team_name")
          .eq("user_id", plan.coach_id)
          .maybeSingle();
        setCoachName(coach?.full_name ?? null);
        setTeamName(coach?.team_name ?? null);
      }

      setLoading(false);
    })();
  }, [navigate]);

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
        transition={{ duration: 0.45 }}
        className="max-w-sm w-full text-center space-y-6"
      >
        {/* Ícone */}
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Zap className="w-8 h-8 text-primary" />
        </div>

        {/* Título personalizado */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-foreground">
            {teamName ? `Bem-vindo à ${teamName}!` : "Bem-vindo!"}
          </h1>
          {coachName ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Seu coach{" "}
              <span className="text-foreground font-semibold">{coachName}</span>{" "}
              está esperando suas respostas para montar o protocolo ideal para você.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Antes de acessar o painel, preencha sua anamnese. Isso leva menos de
              5 minutos e garante que seu protocolo seja personalizado.
            </p>
          )}
        </div>

        {/* Passos */}
        <div className="space-y-3 text-left bg-card border border-border/40 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            O que acontece agora
          </p>
          {[
            "Anamnese: histórico de saúde e objetivos",
            "Fotos de avaliação física (opcional)",
            "Acesso liberado ao seu painel e protocolo",
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-foreground/80">{step}</span>
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
      </motion.div>
    </div>
  );
};

export default Onboarding;
