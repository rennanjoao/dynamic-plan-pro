/**
 * CoachUpdatesCard.tsx
 *
 * Card discreto na área do aluno que aparece quando existe uma linha em
 * `protocol_change_events` para este aluno com `seen_at` nulo. Ao tocar,
 * abre um Sheet listando cada item de `changes` — o aluno vai clicando
 * e cada item é marcado como visto (`seen_item_indexes`), navegando para
 * a aba/âncora correspondente. Quando todos os itens forem vistos (ou o
 * aluno tocar em "Marcar tudo como visto"), o backend preenche `seen_at`
 * e o card some sozinho.
 *
 * Invalidação em tempo real: o listener de `protocol_change_events` é
 * adicionado no MESMO canal realtime já existente em `useStudentData`,
 * então basta invalidar a query aqui via queryKey compartilhada.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export interface CoachChangeItem {
  category: "treino" | "dieta" | "suplemento" | "diretriz" | "geral";
  importance: "alta" | "media" | "baixa";
  label: string;
  target_tab: "treino" | "dieta" | "suplementos" | null;
  target_anchor: string | null;
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

  const orderedItems = useMemo(() => {
    if (!event?.changes) return [] as Array<{ item: CoachChangeItem; originalIndex: number }>;
    return event.changes
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => IMPORTANCE_ORDER[a.item.importance] - IMPORTANCE_ORDER[b.item.importance]);
  }, [event]);

  if (!event) return null;

  async function markItemSeen(originalIndex: number) {
    if (!event) return;
    const nextSeen = Array.from(new Set([...(event.seen_item_indexes ?? []), originalIndex]));
    const total = event.changes?.length ?? 0;
    const allSeen = total > 0 && nextSeen.length >= total;
    const patch: Record<string, unknown> = { seen_item_indexes: nextSeen };
    if (allSeen) patch.seen_at = new Date().toISOString();
    const { error } = await sb
      .from("protocol_change_events")
      .update(patch)
      .eq("id", event.id);
    if (error) {
      console.error("[coach-updates] falha ao marcar item como visto", error);
      return;
    }
    qc.invalidateQueries({ queryKey: ["coach-updates", studentId] });
  }

  async function markAllSeen() {
    if (!event) return;
    const allIdx = (event.changes ?? []).map((_, i) => i);
    const { error } = await sb
      .from("protocol_change_events")
      .update({ seen_item_indexes: allIdx, seen_at: new Date().toISOString() })
      .eq("id", event.id);
    if (error) {
      console.error("[coach-updates] falha ao marcar tudo como visto", error);
      return;
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["coach-updates", studentId] });
  }

  async function handleItemClick(item: CoachChangeItem, originalIndex: number) {
    await markItemSeen(originalIndex);
    setOpen(false);
    if (!item.target_tab) return;
    const routeMap: Record<NonNullable<CoachChangeItem["target_tab"]>, string> = {
      treino: "/workout-plan",
      dieta: "/routine",
      suplementos: "/supplements",
    };
    const base = routeMap[item.target_tab];
    if (!base) return;
    const url = item.target_anchor
      ? `${base}?highlight=${encodeURIComponent(item.target_anchor)}`
      : base;
    navigate(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left bg-primary/10 border border-primary/20 rounded-xl p-4 shadow-sm hover:bg-primary/15 transition-colors flex items-center gap-3"
        aria-label="Ver atualizações do coach"
      >
        <Sparkles className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 space-y-0.5 min-w-0">
          <h3 className="text-sm font-bold text-primary">Seu coach preparou atualizações</h3>
          <p className="text-xs text-primary/80">Toque para ver o que mudou</p>
        </div>
        <ChevronRight className="w-4 h-4 text-primary shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Atualizações do coach</SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {formatRelativeDateTime(event.created_at)}
            </p>
          </SheetHeader>

          <ul className="space-y-2">
            {orderedItems.map(({ item, originalIndex }) => {
              const Icon = iconForCategory(item.category);
              const alreadySeen = (event.seen_item_indexes ?? []).includes(originalIndex);
              return (
                <li key={originalIndex}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item, originalIndex)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors ${
                      alreadySeen ? "opacity-60" : ""
                    }`}
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="flex-1 text-sm text-foreground min-w-0">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
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