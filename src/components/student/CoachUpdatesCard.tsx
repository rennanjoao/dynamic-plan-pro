/**
 * CoachUpdatesCard.tsx
 *
 * Card discreto na área do aluno que aparece quando existe uma linha em
 * `protocol_change_events` para este aluno com `seen_at` nulo. Ao tocar,
 * abre um Sheet listando cada item de `changes`. Cada item expande em
 * cascata (accordion, no máximo 1 aberto) mostrando um "detail" com o
 * que mudou. Um botão dentro da área expandida navega para a tela real.
 *
 * Snapshot estável: enquanto o Sheet estiver aberto, o conteúdo vem de
 * `sheetSnapshot` — assim, marcar o último item como visto (e portanto
 * preencher `seen_at`) não faz o Sheet desmontar por baixo do aluno. O
 * botão-trigger fora do Sheet segue a query ao vivo e some quando não
 * houver mais linha pendente.
 *
 * Invalidação em tempo real: o listener de `protocol_change_events` é
 * adicionado no MESMO canal realtime já existente em `useStudentData`,
 * então basta invalidar a query aqui via queryKey compartilhada.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useStudentData } from "@/hooks/useStudentData";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sparkles,
  Dumbbell,
  Apple,
  Pill,
  ClipboardList,
  ChevronRight,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export interface CoachChangeItem {
  category: "treino" | "dieta" | "suplemento" | "diretriz" | "geral";
  importance: "alta" | "media" | "baixa";
  label: string;
  target_tab: "treino" | "dieta" | "suplementos" | null;
  target_anchor: string | null;
  detail: string | null;
}

interface EventRow {
  id: string;
  changes: CoachChangeItem[];
  seen_item_indexes: number[];
  created_at: string;
}

const IMPORTANCE_ORDER: Record<CoachChangeItem["importance"], number> = {
  alta: 0,
  media: 1,
  baixa: 2,
};

const NAVIGATE_LABEL: Record<NonNullable<CoachChangeItem["target_tab"]>, string> = {
  treino: "Ir para o treino",
  dieta: "Ir para a dieta",
  suplementos: "Ir para os suplementos",
};

const ROUTE_MAP: Record<NonNullable<CoachChangeItem["target_tab"]>, string> = {
  treino: "/workout-plan",
  dieta: "/routine",
  suplementos: "/supplements",
};

function iconForCategory(cat: CoachChangeItem["category"]) {
  switch (cat) {
    case "treino":
      return Dumbbell;
    case "dieta":
      return Apple;
    case "suplemento":
      return Pill;
    case "diretriz":
      return ClipboardList;
    default:
      return Sparkles;
  }
}

function formatRelativeDateTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (diffDays === 0) return `Hoje às ${time}`;
  if (diffDays === 1) return `Ontem às ${time}`;
  return `${d.toLocaleDateString("pt-BR")} às ${time}`;
}

export default function CoachUpdatesCard() {
  const { studentId } = useStudentData();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sheetSnapshot, setSheetSnapshot] = useState<EventRow | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const { data: event } = useQuery({
    queryKey: ["coach-updates", studentId],
    enabled: !!studentId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("protocol_change_events")
        .select("id, changes, seen_item_indexes, created_at")
        .eq("student_id", studentId)
        .is("seen_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as EventRow | null) ?? null;
    },
  });

  // Fonte de verdade DENTRO do Sheet: uma foto estável. Assim, quando o
  // último item é marcado como visto (o backend preenche `seen_at` e a
  // query devolve null), o conteúdo já aberto não some.
  const activeEvent: EventRow | null = open ? sheetSnapshot : event ?? null;

  const orderedItems = useMemo(() => {
    if (!activeEvent?.changes) return [] as Array<{ item: CoachChangeItem; originalIndex: number }>;
    return activeEvent.changes
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => IMPORTANCE_ORDER[a.item.importance] - IMPORTANCE_ORDER[b.item.importance]);
  }, [activeEvent]);

  function handleOpenSheet() {
    if (!event) return;
    setSheetSnapshot(event);
    setExpandedIndex(null);
    setOpen(true);
  }

  function handleSheetOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSheetSnapshot(null);
      setExpandedIndex(null);
    }
  }

  async function markItemSeen(originalIndex: number) {
    const src = sheetSnapshot;
    if (!src) return;
    const nextSeen = Array.from(new Set([...(src.seen_item_indexes ?? []), originalIndex]));
    const total = src.changes?.length ?? 0;
    const allSeen = total > 0 && nextSeen.length >= total;
    const patch: Record<string, unknown> = { seen_item_indexes: nextSeen };
    if (allSeen) patch.seen_at = new Date().toISOString();
    // Reflete no snapshot local antes do round-trip — mantém o Sheet
    // coerente mesmo se a query invalidar depois.
    setSheetSnapshot({ ...src, seen_item_indexes: nextSeen });
    const { error } = await sb
      .from("protocol_change_events")
      .update(patch)
      .eq("id", src.id);
    if (error) {
      console.error("[coach-updates] falha ao marcar item como visto", error);
      return;
    }
    qc.invalidateQueries({ queryKey: ["coach-updates", studentId] });
  }

  async function markAllSeen() {
    const src = sheetSnapshot ?? event;
    if (!src) return;
    const allIdx = (src.changes ?? []).map((_, i) => i);
    const { error } = await sb
      .from("protocol_change_events")
      .update({ seen_item_indexes: allIdx, seen_at: new Date().toISOString() })
      .eq("id", src.id);
    if (error) {
      console.error("[coach-updates] falha ao marcar tudo como visto", error);
      return;
    }
    handleSheetOpenChange(false);
    qc.invalidateQueries({ queryKey: ["coach-updates", studentId] });
  }

  function handleItemToggle(item: CoachChangeItem, originalIndex: number) {
    const isExpandable = !!(item.detail || item.target_tab);
    if (!isExpandable) {
      // Item sem detalhe e sem destino (categoria "geral"): não há o que
      // expandir — apenas marca como visto e segue.
      void markItemSeen(originalIndex);
      return;
    }
    if (expandedIndex === originalIndex) {
      // Segundo clique no mesmo item recolhe (sem re-marcar).
      setExpandedIndex(null);
      return;
    }
    void markItemSeen(originalIndex);
    setExpandedIndex(originalIndex);
  }

  function handleNavigateTo(item: CoachChangeItem) {
    handleSheetOpenChange(false);
    if (!item.target_tab) return;
    const base = ROUTE_MAP[item.target_tab];
    if (!base) return;
    const url = item.target_anchor
      ? `${base}?highlight=${encodeURIComponent(item.target_anchor)}`
      : base;
    navigate(url);
  }

  // O gatilho segue a query ao vivo — some quando não houver mais linha
  // pendente, mesmo com o Sheet ainda aberto exibindo o snapshot.
  if (!event && !open) return null;

  return (
    <>
      {event && (
        <button
          type="button"
          onClick={handleOpenSheet}
          className="w-full text-left bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 shadow-sm hover:bg-emerald-500/15 transition-colors flex items-center gap-3"
          aria-label="Ver atualizações do coach"
        >
          <Sparkles className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="flex-1 space-y-0.5 min-w-0">
            <h3 className="text-sm font-bold text-emerald-500">Seu coach preparou atualizações</h3>
            <p className="text-xs text-emerald-500/80">Toque para ver o que mudou</p>
          </div>
          <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0" />
        </button>
      )}

      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Atualizações do coach</SheetTitle>
            {activeEvent && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatRelativeDateTime(activeEvent.created_at)}
              </p>
            )}
          </SheetHeader>

          <ul className="space-y-2">
            {orderedItems.map(({ item, originalIndex }) => {
              const Icon = iconForCategory(item.category);
              const alreadySeen = (activeEvent?.seen_item_indexes ?? []).includes(originalIndex);
              const isExpandable = !!(item.detail || item.target_tab);
              const isExpanded = expandedIndex === originalIndex;
              return (
                <li key={originalIndex}>
                  <button
                    type="button"
                    onClick={() => handleItemToggle(item, originalIndex)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors ${
                      alreadySeen && !isExpanded ? "opacity-60" : ""
                    }`}
                    aria-expanded={isExpandable ? isExpanded : undefined}
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="flex-1 text-sm text-foreground min-w-0">{item.label}</span>
                    {isExpandable ? (
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    ) : null}
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpandable && isExpanded && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 ml-7 pl-3 border-l-2 border-primary/30 space-y-3 pb-1">
                          {item.detail && (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {item.detail}
                            </p>
                          )}
                          {item.target_tab && (
                            <button
                              type="button"
                              onClick={() => handleNavigateTo(item)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              {NAVIGATE_LABEL[item.target_tab]}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={markAllSeen}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Marcar tudo como visto
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
