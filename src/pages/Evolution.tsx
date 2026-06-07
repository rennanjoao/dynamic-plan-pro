/**
 * Evolution.tsx — Painel de evolução do aluno.
 * Tabs: Dashboard (comparativo) · Histórico (timeline).
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import ComparisonBoard from "@/components/student/ComparisonBoard";
import EvolutionTimeline from "@/components/student/EvolutionTimeline";
import { ProgressChart } from "@/components/student/ProgressChart";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Plus } from "lucide-react";

export default function Evolution() {
  const navigate = useNavigate();
  const { anamnesis, checkIns, loading, studentId } = useStudentData();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth");
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground">Minha Evolução</h1>
            <p className="text-[11px] text-muted-foreground">
              Acompanhe seu progresso e histórico
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {loading || !studentId ? (
          <>
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : (
          <Tabs defaultValue="dashboard" className="space-y-5">
            <TabsList className="grid grid-cols-2 w-full bg-card border border-border">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-4 mt-0">
              <ProgressChart />
              <ComparisonBoard
                anamnesis={anamnesis}
                latestCheckIn={checkIns[0] ?? null}
              />
              <Button className="w-full" onClick={() => navigate("/check-in")}>
                <Plus className="w-4 h-4 mr-2" /> Novo check-in
              </Button>
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <EvolutionTimeline checkIns={checkIns} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
