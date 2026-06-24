/**
 * DynamicRoutine.tsx — Visão Principal da Dieta e Treino (Rotina)
 *
 * Agora este arquivo lê o JSON real do aluno (coach_plans) e renderiza o poderoso
 * StructuredMealsViewer.tsx que replica a inteligência do protocolo HTML original.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StudentToolbar from "@/components/student/StudentToolbar";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";
import StructuredMealsViewer from "@/components/student/StructuredMealsViewer";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import { useWakeLock } from "@/hooks/useWakeLock";

export default function DynamicRoutine() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  useWakeLock();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUserId(data.session.user.id);
      else navigate("/auth");
    });
  }, [navigate]);

  const { data: planData, isLoading } = useQuery({
    queryKey: ["student-routine-json", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_plans")
        .select("diet_strategy_json, workout_periodization_json")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data ?? null;
    },
    staleTime: 60_000,
  });

  const { data: profile } = useQuery({
    queryKey: ["student-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, name")
        .eq("id", userId)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 300_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se o coach não publicou nenhum plano
  if (!planData || (!planData.diet_strategy_json && !planData.workout_periodization_json)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Rotina</h1>
            <p className="text-xs text-muted-foreground">Aguardando seu coach</p>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-dashed">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-base font-bold text-foreground">Dieta em Construção</h2>
              <p className="text-sm text-muted-foreground">
                Seu coach está montando sua estratégia. Assim que o protocolo for publicado, a sua dieta aparecerá aqui.
              </p>
              <Button onClick={() => navigate(-1)} variant="outline" className="mt-4">
                Voltar
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Tenta parsear o JSON para garantir a compatibilidade
  const rawPayload = planData.diet_strategy_json || planData.workout_periodization_json || {};
  const parsed = ProtocolPayloadSchema.safeParse(rawPayload);
  const safePayload = parsed.success ? parsed.data : rawPayload;

  return (
    <div className="min-h-screen bg-background">
      {/* Header Fixo */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Plano Alimentar</h1>
          <p className="text-xs text-muted-foreground">Estratégia Nutricional</p>
        </div>
      </header>

      {/* Conteúdo Principal (100% de largura no mobile, restrito no PC) */}
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-6">
        
        {/* Ferramentas de Estudante (Guias) */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <StudentToolbar />
        </div>

        {/* O COMPONENTE MÁGICO (Abas e Refeições) */}
        <StructuredMealsViewer payload={safePayload} />

        <ProtocolQuestionButton context="meal" variant="full" />

        <div className="h-10" />
      </main>
    </div>
  );
}
