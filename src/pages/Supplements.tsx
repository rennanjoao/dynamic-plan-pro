import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Pill, Info, UtensilsCrossed, Calendar, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";

export default function Supplements() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUserId(data.session.user.id);
    });
  }, []);

  const { data: planData, isLoading } = useQuery({
    queryKey: ["student-supps-json", userId],
    enabled: !!userId,
    queryFn: async () => {
      // 1) Try active protocol first (most recent data structure)
      const { data: protocol } = await supabase
        .from("protocols")
        .select("payload, updated_at")
        .eq("student_id", userId)
        .eq("is_template", false)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const pPayload = (protocol?.payload as Record<string, unknown> | null) ?? null;
      const hasProtocolData =
        pPayload &&
        ((pPayload.guidelines && Object.keys(pPayload.guidelines as object).length > 0) ||
          (Array.isArray(pPayload.supplements) && (pPayload.supplements as unknown[]).length > 0));

      if (hasProtocolData) return pPayload;

      // 2) Fallback: legacy coach_plans.diet_strategy_json
      const { data: plan } = await supabase
        .from("coach_plans")
        .select("diet_strategy_json")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return plan?.diet_strategy_json ?? null;
    },
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const rawPayload = planData || {};
  const parsed = ProtocolPayloadSchema.safeParse(rawPayload);
  const safePayload: any = parsed.success ? parsed.data : rawPayload;

  const g = safePayload?.guidelines ?? {};
  const dietGuideline: string         = g.diet             ?? "";
  const weekOrganization: string      = g.weekOrganization ?? "";
  const supplementationGuideline: string = g.supplementation ?? "";
  const supplements: any[]            = Array.isArray(safePayload?.supplements) ? safePayload.supplements : [];

  const hasAnything =
    dietGuideline.trim() ||
    weekOrganization.trim() ||
    supplementationGuideline.trim() ||
    supplements.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Diretrizes & Suplementação</h1>
          <p className="text-xs text-muted-foreground">Orientações do seu coach</p>
        </div>
        
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Diretrizes da Dieta */}
        {dietGuideline.trim() && (
          <div className="glass rounded-2xl p-4 border border-white/[0.06]">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <UtensilsCrossed className="w-4 h-4 text-primary" /> Diretrizes da Dieta
            </h2>
            <p className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{dietGuideline}</p>
          </div>
        )}

        {/* Organização da Semana */}
        {weekOrganization.trim() && (
          <div className="glass rounded-2xl p-4 border border-white/[0.06]">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary" /> Organização da Semana
            </h2>
            <p className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{weekOrganization}</p>
          </div>
        )}

        {/* Suplementos estruturados */}
        {supplements.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Pill className="w-4 h-4 text-primary" /> Suplementos
            </h2>
            {supplements.map((s: any, i: number) => (
              <Card key={i} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-foreground">{s.name}</span>
                  {s.timing && <Badge variant="outline" className="text-xs">{s.timing}</Badge>}
                </div>
                {s.dose  && <p className="text-sm text-primary font-semibold">{s.dose}</p>}
                {s.notes && <p className="text-xs text-muted-foreground italic mt-1">{s.notes}</p>}
              </Card>
            ))}
          </div>
        )}

        {/* Observações gerais de suplementação */}
        {supplementationGuideline.trim() && (
          <div className="glass rounded-2xl p-4 border border-white/[0.06]">
            <h3 className="text-sm font-bold mb-2 text-foreground flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" /> Observações de Suplementação
            </h3>
            <p className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{supplementationGuideline}</p>
          </div>
        )}

        {!hasAnything && (
          <p className="text-center text-muted-foreground italic py-10">
            Diretrizes ainda não publicadas pelo coach.
          </p>
        )}

        <div className="pt-2">
          <ProtocolQuestionButton context="supplement" variant="full" />
        </div>
      </main>
    </div>
  );
}
