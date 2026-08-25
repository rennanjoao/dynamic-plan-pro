import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pill, Info, UtensilsCrossed, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";
import { useHighlightTarget } from "@/hooks/useHighlightTarget";
import { slug } from "@/lib/slug";
import { ABBR } from "@/lib/weekCycle";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { PageLoader } from "@/components/ui/PageLoader";

export default function Supplements() {
  const navigate = useNavigate();
  const userId = useAuthUserId();
  useHighlightTarget();

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

  if (isLoading) return <PageLoader />;

  const rawPayload = planData || {};
  const parsed = ProtocolPayloadSchema.safeParse(rawPayload);
  const safePayload: any = parsed.success ? parsed.data : rawPayload;

  const g = safePayload?.guidelines ?? {};
  const dietGuideline: string         = g.diet             ?? "";
  const weekOrganization: string      = g.weekOrganization ?? "";
  const supplementationGuideline: string = g.supplementation ?? "";
  const supplements: any[]            = Array.isArray(safePayload?.supplements) ? safePayload.supplements : [];
  const supplementCombos: any[]       = Array.isArray(safePayload?.supplementCombos) ? safePayload.supplementCombos : [];

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
          <h1 className="text-lg font-bold text-foreground">Diretrizes & Sono</h1>
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

        {/* Suplementos agrupados por horário */}
        {supplements.length > 0 && (() => {
          // Índices consumidos por combos → não aparecem soltos.
          const boundSet = new Set<number>();
          supplementCombos.forEach((c: any) =>
            (Array.isArray(c?.supplementIndexes) ? c.supplementIndexes : []).forEach((i: number) => boundSet.add(i))
          );
          const unbound = supplements.filter((_: any, i: number) => !boundSet.has(i));
          const formatFrequency = (days: unknown): string => {
            const list = Array.isArray(days) ? days : [];
            if (list.length === 0) return "Hormônio/Manipulado";
            if (list.length === 7) return "Hormônio/Manipulado — todos os dias";
            const labels = list.map((d) => ABBR[String(d)] ?? String(d));
            return `Hormônio/Manipulado — ${labels.join(", ")}`;
          };
          const groups = unbound.reduce((acc: Record<string, any[]>, s: any) => {
            const key = s.category === "hormonio_manipulado"
              ? formatFrequency(s.weeklyFrequency)
              : (s.timing && String(s.timing).trim()) || "Outros";
            (acc[key] = acc[key] || []).push(s);
            return acc;
          }, {});
          const order = ["Ao acordar", "Manhã", "Pré-treino", "Pós-treino", "Tarde", "Noite", "Antes de dormir"];
          const keys = Object.keys(groups).sort((a, b) => {
            if (a === "Outros") return 1;
            if (b === "Outros") return -1;
            const ia = order.indexOf(a); const ib = order.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });

          const renderItem = (s: any, i: number) => (
            <li
              key={i}
              id={`supplement-${slug(s.name)}`}
              className="border-b border-border/40 last:border-0 pb-2 last:pb-0"
            >
              <p className="text-sm text-foreground">
                <span className="text-primary">•</span>{" "}
                <span className="font-bold">{s.name}</span>
                {s.dose && <span className="font-bold"> — {s.dose}</span>}
              </p>
              {s.notes && (
                <p className="text-xs text-muted-foreground italic mt-0.5 pl-3">{s.notes}</p>
              )}
            </li>
          );

          return (
            <div className="space-y-3">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Pill className="w-4 h-4 text-primary" /> Suplementos prescritos
              </h2>

              {/* Combos primeiro (nome do combo como cabeçalho) */}
              {supplementCombos.map((c: any, ci: number) => {
                const indexes: number[] = Array.isArray(c?.supplementIndexes) ? c.supplementIndexes : [];
                const items = indexes
                  .map((i) => supplements[i])
                  .filter(Boolean);
                if (items.length === 0) return null;
                return (
                  <div key={`combo-${ci}`} className="glass rounded-2xl p-4 border border-primary/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-primary/60 text-primary bg-primary/10 font-bold">
                          {c.name || "Combo"}
                        </Badge>
                        {c.timing && (
                          <span className="text-[10px] text-muted-foreground">{c.timing}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{items.length} item(ns)</span>
                    </div>
                    <ul className="space-y-2 pt-1">
                      {items.map((s: any, i: number) => renderItem(s, i))}
                    </ul>
                  </div>
                );
              })}

              {/* Depois, os suplementos soltos agrupados por horário */}
              {keys.map((timing) => (
                <div key={timing} className="glass rounded-2xl p-4 border border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs border-primary/40 text-primary bg-primary/5">
                      {timing}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{groups[timing].length} item(ns)</span>
                  </div>
                  <ul className="space-y-2 pt-1">
                    {groups[timing].map((s: any, i: number) => renderItem(s, i))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Diretriz geral de sono */}
        {supplementationGuideline.trim() && (
          <div className="glass rounded-2xl p-4 border border-white/[0.06]">
            <h3 className="text-sm font-bold mb-2 text-foreground flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" /> Sono
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
