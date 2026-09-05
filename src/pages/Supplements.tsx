import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Pill, Info, UtensilsCrossed, Calendar, Copy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import ProtocolQuestionButton from "@/components/student/ProtocolQuestionButton";
import { useHighlightTarget } from "@/hooks/useHighlightTarget";
import { slug } from "@/lib/slug";
import { ABBR } from "@/lib/weekCycle";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { PageLoader } from "@/components/ui/PageLoader";
import PreviewModeBar from "@/components/student/PreviewModeBar";

// ─── Card interno recolhível ─────────────────────────────────────────────────
// Cada diretriz vive dentro de um card que inicia minimizado; o aluno clica
// no cabeçalho (ou no chevron) para expandir/recolher. `headerExtra` permite
// um controle adicional no cabeçalho (ex.: botão "Copiar para cotação") sem
// que ele dispare o toggle de abrir/fechar.
function GuidelineAccordionItem({
  isOpen,
  onToggle,
  icon,
  title,
  headerExtra,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden">
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 min-w-0">
            {icon} <span className="truncate">{title}</span>
          </h2>
        </button>
        {headerExtra}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Recolher" : "Expandir"}
          className="shrink-0 p-1 -m-1"
        >
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>
      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Supplements() {
  const navigate = useNavigate();
  const userId = useAuthUserId();
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");
  const draftPreview = searchParams.get("draftPreview") === "1";
  useHighlightTarget();

  // Todos os cards internos iniciam minimizados/recolhidos.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const { data: planData, isLoading } = useQuery({
    queryKey: ["student-supps-json", userId, draftPreview],
    enabled: !!userId,
    queryFn: async () => {
      // 1) Try active protocol first (most recent data structure)
      const { data: protocol } = await supabase
        .from("protocols")
        .select("payload, draft_payload, updated_at")
        .eq("student_id", userId)
        .eq("is_template", false)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const draft = protocol?.draft_payload as Record<string, unknown> | null | undefined;
      const pPayload =
        (draftPreview && draft && Object.keys(draft).length > 0
          ? draft
          : (protocol?.payload as Record<string, unknown> | null)) ?? null;
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
      <PreviewModeBar />
      <header className={`bg-background border-b px-4 py-3 flex items-center gap-3 shadow-sm ${!previewAs ? "sticky top-0 z-40" : ""}`}>
        <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Diretrizes & Suplementação</h1>
          <p className="text-xs text-muted-foreground">Orientações do seu coach</p>
        </div>
        
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* 1. Sono */}
        {supplementationGuideline.trim() && (
          <GuidelineAccordionItem
            isOpen={!!openSections.sono}
            onToggle={() => toggleSection("sono")}
            icon={<Info className="w-4 h-4 text-primary" />}
            title="Sono"
          >
            <p className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{supplementationGuideline}</p>
          </GuidelineAccordionItem>
        )}

        {/* 2. Organização da Semana */}
        {weekOrganization.trim() && (
          <GuidelineAccordionItem
            isOpen={!!openSections.semana}
            onToggle={() => toggleSection("semana")}
            icon={<Calendar className="w-4 h-4 text-primary" />}
            title="Organização da Semana"
          >
            <p className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{weekOrganization}</p>
          </GuidelineAccordionItem>
        )}

        {/* 3. Diretrizes da Dieta */}
        {dietGuideline.trim() && (
          <GuidelineAccordionItem
            isOpen={!!openSections.dieta}
            onToggle={() => toggleSection("dieta")}
            icon={<UtensilsCrossed className="w-4 h-4 text-primary" />}
            title="Diretrizes da Dieta"
          >
            <p className="text-sm whitespace-pre-wrap text-foreground/85 leading-relaxed">{dietGuideline}</p>
          </GuidelineAccordionItem>
        )}

        {/* 4. Suplementos agrupados por horário */}
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
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                <span className="text-primary">•</span>{" "}
                <span className="font-bold">{s.name}</span>
                {s.dose && <span className="font-bold"> — {s.dose}</span>}
              </p>
              {s.notes && (
                <p className="text-xs text-muted-foreground italic mt-0.5 pl-3 whitespace-pre-wrap break-words">{s.notes}</p>
              )}
            </li>
          );

          // Texto puro da prescrição — para o aluno copiar e cotar/comprar.
          const itemLine = (s: any) =>
            `• ${s.name ?? ""}${s.dose ? ` — ${s.dose}` : ""}${s.notes ? ` (${s.notes})` : ""}`;

          // Botões de cópia por categoria de compra — consideram TODOS os
          // suplementos (soltos e dentro de combos), filtrados apenas pelos
          // marcados pelo coach como "Incluir na cotação/compra"
          // (needsPurchase !== false — default true, inclusive itens antigos
          // sem o campo). A lista principal do aluno acima não é afetada:
          // os itens desmarcados continuam visíveis normalmente, só não
          // entram em nenhum botão de cópia.
          const PURCHASE_META: Record<string, { label: string; button: string }> = {
            manipulacao:       { label: "Manipulação",       button: "Copiar Manipulação para Cotação" },
            farmacia:          { label: "Farmácia",          button: "Copiar Farmácia para Compra" },
            produtos_naturais: { label: "Produtos Naturais", button: "Copiar Produtos Naturais para Compra" },
            outros:            { label: "Outros",            button: "Copiar Outros" },
          };
          const PURCHASE_ORDER = ["manipulacao", "farmacia", "produtos_naturais", "outros"];
          const purchaseGroups: Record<string, any[]> = {};
          supplements.forEach((s: any) => {
            if (s.needsPurchase === false) return;
            const type = s.purchaseType || "outros";
            (purchaseGroups[type] = purchaseGroups[type] || []).push(s);
          });
          const purchaseTypesWithItems = PURCHASE_ORDER.filter((t) => (purchaseGroups[t] || []).length > 0);

          const copyPurchaseGroup = async (type: string) => {
            const text = (purchaseGroups[type] || []).map(itemLine).join("\n");
            try {
              await navigator.clipboard.writeText(text);
              toast.success(`Lista de ${PURCHASE_META[type].label} copiada`);
            } catch {
              toast.error("Não foi possível copiar");
            }
          };

          return (
            <GuidelineAccordionItem
              isOpen={!!openSections.suplementacao}
              onToggle={() => toggleSection("suplementacao")}
              icon={<Pill className="w-4 h-4 text-primary" />}
              title="Suplementos prescritos"
            >
              <div className="space-y-3">
                {purchaseTypesWithItems.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-1">
                    {purchaseTypesWithItems.map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => copyPurchaseGroup(t)}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> {PURCHASE_META[t].button}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Combos primeiro (nome do combo como cabeçalho) */}
                {supplementCombos.map((c: any, ci: number) => {
                  const indexes: number[] = Array.isArray(c?.supplementIndexes) ? c.supplementIndexes : [];
                  const items = indexes
                    .map((i) => supplements[i])
                    .filter(Boolean);
                  if (items.length === 0) return null;
                  return (
                    <div key={`combo-${ci}`} className="glass rounded-2xl p-4 border border-primary/20 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-wrap min-w-0">
                          <Badge
                            variant="outline"
                            className="text-xs border-primary/60 text-primary bg-primary/10 font-bold max-w-full whitespace-normal break-words text-left h-auto"
                          >
                            {c.name || "Combo"}
                          </Badge>
                          {c.timing && (
                            <span className="text-[10px] text-muted-foreground mt-1">{c.timing}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{items.length} item(ns)</span>
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
            </GuidelineAccordionItem>
          );
        })()}

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
