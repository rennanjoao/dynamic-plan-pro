/**
 * ShoppingList.tsx — Lista de Compras v4
 *
 * Melhorias v4:
 * - Lógica de agregação centralizada em shoppingListAgg.ts (sem duplicação)
 * - Persistência de estado em localStorage (itens riscados + opções + período)
 * - Cálculo correto com ciclo de carbo por dia real da semana
 * - Respeita hiddenKinds por refeição
 * - Tela de opções com contexto (horário + quantidade por alimento)
 * - Pré-seleção das opções da sessão anterior
 * - Barra de progresso com contador X/N
 * - Seção "Já no carrinho" colapsável
 * - Tela de conclusão com streak de semanas
 * - PDF colorido por categoria
 * - Aviso honesto quando ciclo de carbo afeta o cálculo
 * - Modo mercado: tela de foco com itens grandes
 * - Botões de exportação desabilitados quando lista vazia
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  ShoppingCart,
  Share2,
  FileDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
} from "lucide-react";
import jsPDF from "jspdf";
import {
  aggregateShoppingList,
  formatQty,
  stripHtml,
  parseGrams,
  parseUnit,
  type AggItem,
} from "@/lib/shoppingListAgg";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MacroKind = "protein" | "carb" | "fat" | "veg" | "other";
type Phase = "choosing" | "list" | "market" | "done";

interface ChoiceNeeded {
  label: string;
  sublabel: string; // horário da refeição
  key: string;
  options: {
    idx: number;
    name: string;
    items: { name: string; qty: string }[];
  }[];
}

interface ShoppingState {
  struck: Record<string, boolean>;
  selectedOptions: Record<string, number>;
  period: number;
  protocolUpdatedAt: string;
  generatedAt: number;
  streak: number;
  lastCompletedAt: string | null;
}

// ─── Configuração visual ──────────────────────────────────────────────────────

const KIND_CFG: Record
  MacroKind,
  { label: string; color: string; border: string; bg: string; iconClass: string }
> = {
  protein: {
    label: "Proteínas",
    color: "#60a5fa",
    border: "rgba(59,130,246,0.25)",
    bg: "rgba(59,130,246,0.06)",
    iconClass: "ti-dna-2",
  },
  carb: {
    label: "Carboidratos",
    color: "#fbbf24",
    border: "rgba(251,191,36,0.25)",
    bg: "rgba(251,191,36,0.06)",
    iconClass: "ti-wheat",
  },
  fat: {
    label: "Gorduras",
    color: "#f87171",
    border: "rgba(248,113,113,0.25)",
    bg: "rgba(248,113,113,0.06)",
    iconClass: "ti-droplet",
  },
  veg: {
    label: "Legumes & Saladas",
    color: "#34d399",
    border: "rgba(52,211,153,0.25)",
    bg: "rgba(52,211,153,0.06)",
    iconClass: "ti-salad",
  },
  other: {
    label: "Outros",
    color: "#a3a3a3",
    border: "rgba(163,163,163,0.25)",
    bg: "rgba(163,163,163,0.06)",
    iconClass: "ti-package",
  },
};

const KIND_ORDER: MacroKind[] = ["protein", "carb", "fat", "veg", "other"];

const PERIODS = [
  { label: "1 dia", days: 1 },
  { label: "3 dias", days: 3 },
  { label: "1 sem", days: 7 },
  { label: "2 sem", days: 14 },
  { label: "1 mês", days: 30 },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────

function stateKey(userId: string, protocolId: string) {
  return `shopping_state_${userId}_${protocolId}`;
}

function loadState(userId: string, protocolId: string): ShoppingState | null {
  try {
    const raw = localStorage.getItem(stateKey(userId, protocolId));
    return raw ? (JSON.parse(raw) as ShoppingState) : null;
  } catch {
    return null;
  }
}

function saveState(userId: string, protocolId: string, state: ShoppingState) {
  try {
    localStorage.setItem(stateKey(userId, protocolId), JSON.stringify(state));
  } catch {
    /* noop */
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kindFromStr(k: string): MacroKind {
  if (k === "protein") return "protein";
  if (k === "carb") return "carb";
  if (k === "fat") return "fat";
  if (k === "veg" || k === "vegetable" || k === "salad") return "veg";
  return "other";
}

function detectChoices(meals: any[]): ChoiceNeeded[] {
  const choices: ChoiceNeeded[] = [];

  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
    const hidden: string[] = Array.isArray(meal.hiddenKinds) ? meal.hiddenKinds : [];

    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = o?.kind || "other";
      (byKind[k] ||= []).push(o);
    });

    Object.entries(byKind).forEach(([kind, kindOpts]) => {
      if (hidden.includes(kind)) return;
      if (kindOpts.length <= 1) return;

      const firstNames = (kindOpts[0]?.items || []).map((it: any) =>
        stripHtml(it?.baseName || it?.name || "").toLowerCase(),
      );
      const hasDiff = kindOpts.slice(1).some((o) =>
        (o?.items || []).some(
          (it: any) =>
            !firstNames.includes(
              stripHtml(it?.baseName || it?.name || "").toLowerCase(),
            ),
        ),
      );
      if (!hasDiff) return;

      const options = kindOpts.map((o, idx) => {
        const firstName = stripHtml(
          o?.items?.[0]?.baseName || o?.items?.[0]?.name || `Opção ${idx + 1}`,
        );
        const items = (o?.items || []).map((it: any) => {
          const g = parseGrams(it);
          const u = parseUnit(it);
          const name = stripHtml(it?.baseName || it?.name || "");
          return { name, qty: g > 0 ? formatQty(g, u) : "" };
        });
        return { idx, name: firstName, items };
      });

      choices.push({
        label: `${meal.name || `Refeição ${mi + 1}`} · ${KIND_CFG[kindFromStr(kind)]?.label || kind}`,
        sublabel: meal.time || "",
        key: `${mi}:${kind}`,
        options,
      });
    });
  });

  return choices;
}

function hasCarbCycleActive(carbCycle: Record<string, unknown>): boolean {
  return (
    Object.keys(carbCycle).length > 0 &&
    Object.values(carbCycle).some(
      (v) => v === "high" || v === "off" || v === "low",
    )
  );
}

function calcStreak(lastCompletedAt: string | null, prevStreak: number): number {
  if (!lastCompletedAt) return 0;
  const last = new Date(lastCompletedAt);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
  );
  // Concluiu esta semana (até 8 dias atrás = tolerância de 1 semana)
  if (diffDays <= 8) return prevStreak + 1;
  return 1;
}

// ─── Estilos compartilhados ───────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: "rgba(var(--background-rgb, 17,17,17), 0.9)",
  backdropFilter: "blur(12px)",
  borderBottom: "0.5px solid var(--color-border-tertiary)",
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const backBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "0.5px solid var(--color-border-secondary)",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--color-text-secondary)",
  flexShrink: 0,
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-background-primary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: 12,
  padding: "1rem 1.125rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ShoppingList() {
  const navigate = useNavigate();

  const [protocol, setProtocol] = useState<any>(null);
  const [protocolId, setProtocolId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [days, setDays] = useState(7);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<Phase>("choosing");
  const [struck, setStruck] = useState<Record<string, boolean>>({});
  const [cartCollapsed, setCartCollapsed] = useState(true);
  const [streak, setStreak] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [choiceStep, setChoiceStep] = useState(0);
  const [protocolUpdatedWarning, setProtocolUpdatedWarning] = useState(false);

  // Ref para evitar re-save infinito
  const stateRef = useRef<ShoppingState | null>(null);

  // ── Carrega protocolo e estado salvo ────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) {
        navigate("/auth");
        return;
      }
      const uid = data.session.user.id;
      setUserId(uid);

      const { data: p } = await supabase
        .from("protocols")
        .select("id, payload, name, updated_at")
        .eq("student_id", uid)
        .eq("is_template", false)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setProtocol(p);

      if (p?.id) {
        setProtocolId(p.id);
        const saved = loadState(uid, p.id);

        if (saved) {
          // Verifica se protocolo foi atualizado após a geração da lista
          if (
            p.updated_at &&
            saved.generatedAt &&
            new Date(p.updated_at).getTime() > saved.generatedAt
          ) {
            setProtocolUpdatedWarning(true);
          }

          setSelectedOptions(saved.selectedOptions || {});
          setDays(saved.period || 7);
          setStruck(saved.struck || {});
          setStreak(saved.streak || 0);
          setLastCompletedAt(saved.lastCompletedAt || null);
          stateRef.current = saved;
        }
      }

      setLoading(false);
    });
  }, [navigate]);

  // ── Extrai dados do payload ──────────────────────────────────────────────────
  const meals: any[] = useMemo(() => {
    const m = (protocol?.payload as any)?.meals;
    return Array.isArray(m) ? m : [];
  }, [protocol]);

  const carbCycle: Record<string, unknown> = useMemo(
    () => (protocol?.payload as any)?.carbCycle ?? {},
    [protocol],
  );
  const carbCycleHighPct: number = useMemo(
    () => (protocol?.payload as any)?.carbCycleHighPct ?? 15,
    [protocol],
  );
  const carbCycleLowPct: number = useMemo(
    () => (protocol?.payload as any)?.carbCycleLowPct ?? 15,
    [protocol],
  );

  const choices = useMemo(() => detectChoices(meals), [meals]);
  const hasCycle = useMemo(() => hasCarbCycleActive(carbCycle), [carbCycle]);

  // ── Se não há conflitos, vai direto para a lista ─────────────────────────────
  useEffect(() => {
    if (!loading && meals.length > 0 && choices.length === 0) {
      setPhase("list");
    }
  }, [loading, meals, choices]);

  // ── Agrega itens usando a função canônica ────────────────────────────────────
  const items: AggItem[] = useMemo(
    () =>
      aggregateShoppingList({
        meals,
        selectedOptions,
        days,
        carbCycle,
        carbCycleHighPct,
        carbCycleLowPct,
      }),
    [meals, selectedOptions, days, carbCycle, carbCycleHighPct, carbCycleLowPct],
  );

  const grouped = useMemo(() => {
    const g: Record<MacroKind, AggItem[]> = {
      protein: [],
      carb: [],
      fat: [],
      veg: [],
      other: [],
    };
    items.forEach((it) => {
      const k = kindFromStr(it.kind);
      g[k].push(it);
    });
    return g;
  }, [items]);

  const kindsWithItems = KIND_ORDER.filter((k) => grouped[k].length > 0);

  // ── Contadores ───────────────────────────────────────────────────────────────
  const totalItems = items.length;
  const struckCount = items.filter((it) => struck[`${it.kind}:${it.name}`]).length;
  const visibleCount = totalItems - struckCount;

  // ── Persiste estado no localStorage ─────────────────────────────────────────
  const persistState = useCallback(() => {
    if (!userId || !protocolId) return;
    const state: ShoppingState = {
      struck,
      selectedOptions,
      period: days,
      protocolUpdatedAt: protocol?.updated_at || "",
      generatedAt: stateRef.current?.generatedAt || Date.now(),
      streak,
      lastCompletedAt,
    };
    stateRef.current = state;
    saveState(userId, protocolId, state);
  }, [userId, protocolId, struck, selectedOptions, days, protocol, streak, lastCompletedAt]);

  useEffect(() => {
    if (phase === "list" || phase === "market") {
      persistState();
    }
  }, [struck, selectedOptions, days, phase, persistState]);

  // ── Marcar / desmarcar item ──────────────────────────────────────────────────
  const toggleStruck = useCallback(
    (key: string) => {
      setStruck((s) => ({ ...s, [key]: !s[key] }));
      if (navigator.vibrate) navigator.vibrate(30);
    },
    [],
  );

  // ── Concluir compras ─────────────────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    const now = new Date().toISOString();
    const newStreak = calcStreak(lastCompletedAt, streak);
    setStreak(newStreak);
    setLastCompletedAt(now);

    // Persiste imediatamente
    if (userId && protocolId) {
      const state: ShoppingState = {
        struck,
        selectedOptions,
        period: days,
        protocolUpdatedAt: protocol?.updated_at || "",
        generatedAt: stateRef.current?.generatedAt || Date.now(),
        streak: newStreak,
        lastCompletedAt: now,
      };
      stateRef.current = state;
      saveState(userId, protocolId, state);

      // Salva sessão no Supabase em background (sem bloquear)
      (async () => {
        try {
          await (supabase as any).from("shopping_sessions").insert({
            user_id: userId,
            protocol_id: protocolId,
            period_days: days,
            items_total: totalItems,
            items_completed: struckCount,
            completed: visibleCount === 0,
            streak: newStreak,
          });
        } catch {
          /* falha silenciosa */
        }
      })();
    }

    setPhase("done");
  }, [
    userId,
    protocolId,
    struck,
    selectedOptions,
    days,
    protocol,
    streak,
    lastCompletedAt,
    totalItems,
    struckCount,
    visibleCount,
  ]);

  // ── Gerar texto para exportação ──────────────────────────────────────────────
  function buildText(): string {
    const header =
      days === 1 ? "🛒 Lista de Compras — 1 dia" : `🛒 Lista de Compras — ${days} dias`;
    const lines = [header, ""];
    kindsWithItems.forEach((kind) => {
      const visibleItems = grouped[kind].filter(
        (it) => !struck[`${it.kind}:${it.name}`],
      );
      if (!visibleItems.length) return;
      lines.push(`*${KIND_CFG[kind].label}*`);
      visibleItems.forEach((it) =>
        lines.push(`• ${it.name} — ${formatQty(it.total, it.unit)}`),
      );
      lines.push("");
    });
    lines.push("_Quantidades em peso cru · Elite Prime Hub_");
    return lines.join("\n");
  }

  const shareWhatsApp = () => {
    if (visibleCount === 0) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildText())}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  // ── PDF colorido por categoria ───────────────────────────────────────────────
  const exportPDF = () => {
    if (visibleCount === 0) return;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 18;

    // Cabeçalho
    doc.setFillColor(204, 0, 0);
    doc.rect(0, 0, pageW, 12, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `Lista de Compras — ${days === 1 ? "1 dia" : `${days} dias`}`,
      14,
      8.5,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Gerado em ${new Date().toLocaleDateString("pt-BR")} · ${protocol?.name || "Protocolo ativo"}`,
      pageW - 14,
      8.5,
      { align: "right" },
    );
    y = 22;

    const colorMap: Record<MacroKind, [number, number, number]> = {
      protein: [59, 130, 246],
      carb: [251, 191, 36],
      fat: [248, 113, 113],
      veg: [52, 211, 153],
      other: [163, 163, 163],
    };

    kindsWithItems.forEach((kind) => {
      const visibleItems = grouped[kind].filter(
        (it) => !struck[`${it.kind}:${it.name}`],
      );
      if (!visibleItems.length) return;

      if (y > 265) {
        doc.addPage();
        y = 18;
      }

      const [r, g, b] = colorMap[kind];

      // Cabeçalho da categoria
      doc.setFillColor(r, g, b);
      doc.roundedRect(12, y - 4, pageW - 24, 10, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(KIND_CFG[kind].label.toUpperCase(), 16, y + 2.5);
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);

      visibleItems.forEach((it) => {
        if (y > 280) {
          doc.addPage();
          y = 18;
        }
        // Checkbox
        doc.setDrawColor(r, g, b);
        doc.rect(14, y - 3.5, 4.5, 4.5);
        doc.text(it.name, 22, y);
        doc.setFont("helvetica", "bold");
        doc.text(formatQty(it.total, it.unit), pageW - 14, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 7;
      });
      y += 4;
    });

    // Rodapé
    if (y < 275) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Quantidades em peso cru · Elite Prime Hub", 14, 287);
    }

    doc.save(`lista-${days}d-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Avançar escolha de opções ────────────────────────────────────────────────
  const currentChoice = choices[choiceStep];
  const allChosen = choices.every((c) => selectedOptions[c.key] !== undefined);

  const handleNextChoice = () => {
    if (choiceStep < choices.length - 1) {
      setChoiceStep((s) => s + 1);
    } else {
      // Inicializa generatedAt quando o aluno confirma as opções
      if (!stateRef.current?.generatedAt) {
        stateRef.current = { ...stateRef.current! } || {
          struck: {},
          selectedOptions,
          period: days,
          protocolUpdatedAt: protocol?.updated_at || "",
          generatedAt: Date.now(),
          streak,
          lastCompletedAt,
        };
        stateRef.current.generatedAt = Date.now();
      }
      setPhase("list");
    }
  };

  const handlePrevChoice = () => {
    if (choiceStep > 0) setChoiceStep((s) => s - 1);
  };

  // ── Mudar período com aviso de reset de riscados ──────────────────────────────
  const handleChangePeriod = (newDays: number) => {
    if (newDays === days) return;
    if (struckCount > 0) {
      // Reset dos riscados ao mudar período
      setStruck({});
    }
    setDays(newDays);
  };

  // ── Regenerar lista (protocolo atualizado) ───────────────────────────────────
  const handleRegenerate = () => {
    setStruck({});
    setSelectedOptions({});
    setChoiceStep(0);
    setProtocolUpdatedWarning(false);
    if (stateRef.current) {
      stateRef.current.generatedAt = Date.now();
    }
    if (choices.length === 0) {
      setPhase("list");
    } else {
      setPhase("choosing");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-background-tertiary)",
        }}
      >
        <Loader2
          style={{ width: 28, height: 28, color: "#CC0000" }}
          className="animate-spin"
        />
      </div>
    );
  }

  // ── Sem protocolo ────────────────────────────────────────────────────────────
  if (!meals.length) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-background-tertiary)",
          padding: "2rem 1rem",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <Link
            to="/student-area"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginBottom: 24,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={15} /> Voltar
          </Link>
          <div style={cardStyle}>
            <ShoppingCart
              size={36}
              style={{ color: "var(--color-text-tertiary)", marginBottom: 12 }}
            />
            <p
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: 6,
              }}
            >
              Nenhum protocolo ativo
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Assim que seu coach publicar seu protocolo, sua lista aparece aqui
              automaticamente.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de conclusão ────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-background-tertiary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
        }}
      >
        <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(52,211,153,0.12)",
              border: "0.5px solid rgba(52,211,153,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <CheckCircle2 size={36} style={{ color: "#34d399" }} />
          </div>

          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 6,
            }}
          >
            Compras da semana concluídas!
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginBottom: 20,
            }}
          >
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>

          {streak >= 2 && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(251,146,60,0.1)",
                border: "0.5px solid rgba(251,146,60,0.3)",
                borderRadius: 20,
                padding: "6px 14px",
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 16 }}>🔥</span>
              <span
                style={{ fontSize: 13, fontWeight: 500, color: "#f97316" }}
              >
                {streak} semanas de compras organizadas
              </span>
            </div>
          )}

          <div
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 24,
              display: "flex",
              justifyContent: "space-around",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {totalItems}
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                itens comprados
              </p>
            </div>
            <div
              style={{
                width: 1,
                background: "var(--color-border-tertiary)",
              }}
            />
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {days}d
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                de protocolo
              </p>
            </div>
            <div
              style={{
                width: 1,
                background: "var(--color-border-tertiary)",
              }}
            />
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                {kindsWithItems.length}
              </p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                categorias
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate("/student-area")}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 10,
              border: "none",
              background: "#CC0000",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // ── Modo mercado ─────────────────────────────────────────────────────────────
  if (phase === "market") {
    const pendingItems = items.filter(
      (it) => !struck[`${it.kind}:${it.name}`],
    );
    const doneItems = items.filter((it) => struck[`${it.kind}:${it.name}`]);

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-background-tertiary)",
          paddingBottom: "2rem",
        }}
      >
        <header style={headerStyle}>
          <button onClick={() => setPhase("list")} style={backBtnStyle}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              🛒 No mercado
            </p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              {pendingItems.length > 0
                ? `${pendingItems.length} ${pendingItems.length === 1 ? "item" : "itens"} para pegar`
                : "Tudo no carrinho!"}
            </p>
          </div>
          {pendingItems.length === 0 && (
            <button
              onClick={handleComplete}
              style={{
                background: "#34d399",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Concluir
            </button>
          )}
        </header>

        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {pendingItems.map((it) => {
            const key = `${it.kind}:${it.name}`;
            const cfg = KIND_CFG[kindFromStr(it.kind)];
            return (
              <button
                key={key}
                onClick={() => toggleStruck(key)}
                style={{
                  width: "100%",
                  background: "var(--color-background-primary)",
                  border: `0.5px solid ${cfg.border}`,
                  borderRadius: 12,
                  padding: "18px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    textAlign: "left",
                  }}
                >
                  {it.name}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: cfg.color,
                    flexShrink: 0,
                  }}
                >
                  {formatQty(it.total, it.unit)}
                </span>
              </button>
            );
          })}

          {doneItems.length > 0 && (
            <div
              style={{
                marginTop: 8,
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                Já no carrinho ({doneItems.length})
              </p>
              {doneItems.map((it) => {
                const key = `${it.kind}:${it.name}`;
                return (
                  <button
                    key={key}
                    onClick={() => toggleStruck(key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "transparent",
                      border: "none",
                      padding: "6px 0",
                      cursor: "pointer",
                      opacity: 0.5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--color-text-tertiary)",
                        textDecoration: "line-through",
                      }}
                    >
                      {it.name}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-tertiary)",
                        textDecoration: "line-through",
                      }}
                    >
                      {formatQty(it.total, it.unit)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setPhase("list")}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "11px",
              borderRadius: 10,
              border: "0.5px solid var(--color-border-tertiary)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Sair do modo mercado
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de escolha de opções ─────────────────────────────────────────────────
  if (phase === "choosing" && choices.length > 0) {
    const choiceChosen = currentChoice
      ? selectedOptions[currentChoice.key] !== undefined
      : false;

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-background-tertiary)",
          padding: "0 0 2rem",
        }}
      >
        <header style={headerStyle}>
          <button
            onClick={() =>
              choiceStep > 0 ? handlePrevChoice() : navigate(-1)
            }
            style={backBtnStyle}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              O que você vai usar?
            </p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              {choiceStep + 1} de {choices.length}{" "}
              {choices.length === 1 ? "escolha" : "escolhas"}
            </p>
          </div>
        </header>

        {/* Barra de progresso das escolhas */}
        <div
          style={{
            height: 3,
            background: "var(--color-background-secondary)",
            marginBottom: 0,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${((choiceStep + (choiceChosen ? 1 : 0)) / choices.length) * 100}%`,
              background: "#CC0000",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        <div
          style={{ maxWidth: 480, margin: "0 auto", padding: "1.5rem 1rem" }}
        >
          {currentChoice && (
            <>
              {/* Contexto da refeição */}
              <div
                style={{
                  background: "rgba(204,0,0,0.06)",
                  border: "0.5px solid rgba(204,0,0,0.2)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 16,
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#CC0000",
                    marginBottom: currentChoice.sublabel ? 2 : 0,
                  }}
                >
                  {currentChoice.label}
                </p>
                {currentChoice.sublabel && (
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    🕐 {currentChoice.sublabel}
                  </p>
                )}
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {currentChoice.options.map((opt) => {
                  const chosen =
                    selectedOptions[currentChoice.key] === opt.idx;
                  return (
                    <button
                      key={opt.idx}
                      onClick={() =>
                        setSelectedOptions((s) => ({
                          ...s,
                          [currentChoice.key]: opt.idx,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: chosen
                          ? "2px solid #CC0000"
                          : "0.5px solid var(--color-border-secondary)",
                        background: chosen
                          ? "rgba(204,0,0,0.07)"
                          : "var(--color-background-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: opt.items.length > 0 ? 8 : 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: chosen
                              ? "#CC0000"
                              : "var(--color-text-primary)",
                          }}
                        >
                          {opt.name}
                        </span>
                        {chosen && (
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              background: "#CC0000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <i
                              className="ti ti-check"
                              style={{ fontSize: 11, color: "#fff" }}
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </div>
                      {opt.items.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {opt.items.map((item, ii) => (
                            <div
                              key={ii}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 12,
                                color: chosen
                                  ? "rgba(204,0,0,0.7)"
                                  : "var(--color-text-secondary)",
                              }}
                            >
                              <span>{item.name}</span>
                              {item.qty && (
                                <span style={{ fontWeight: 500 }}>
                                  {item.qty}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNextChoice}
                disabled={!choiceChosen}
                style={{
                  width: "100%",
                  marginTop: 20,
                  padding: "14px",
                  borderRadius: 10,
                  border: "none",
                  background: choiceChosen
                    ? "#CC0000"
                    : "var(--color-background-secondary)",
                  color: choiceChosen ? "#fff" : "var(--color-text-tertiary)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: choiceChosen ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                {choiceStep < choices.length - 1
                  ? "Próxima →"
                  : "Ver minha lista de compras"}
              </button>

              {!choiceChosen && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-tertiary)",
                    textAlign: "center",
                    marginTop: 10,
                  }}
                >
                  Selecione uma opção para continuar
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Lista pronta ──────────────────────────────────────────────────────────────
  const progressPct = totalItems > 0 ? (struckCount / totalItems) * 100 : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-background-tertiary)",
        paddingBottom: "2rem",
      }}
    >
      <header style={headerStyle}>
        {choices.length > 0 ? (
          <button
            onClick={() => {
              setChoiceStep(choices.length - 1);
              setPhase("choosing");
            }}
            style={backBtnStyle}
            aria-label="Voltar às escolhas"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Link
            to="/student-area"
            style={{
              ...backBtnStyle,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </Link>
        )}
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--color-text-primary)",
            }}
          >
            Lista de compras
          </p>
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {protocol?.name || "Protocolo ativo"} ·{" "}
            {days === 1 ? "1 dia" : `${days} dias`}
          </p>
        </div>
        <button
          onClick={() => setPhase("market")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(204,0,0,0.1)",
            color: "#CC0000",
            border: "0.5px solid rgba(204,0,0,0.3)",
            borderRadius: 8,
            padding: "7px 11px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
          aria-label="Modo mercado"
        >
          <ShoppingBag size={13} /> Mercado
        </button>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem" }}>

        {/* Aviso de protocolo atualizado */}
        {protocolUpdatedWarning && (
          <div
            style={{
              background: "rgba(251,191,36,0.08)",
              border: "0.5px solid rgba(251,191,36,0.35)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                  marginBottom: 4,
                }}
              >
                Protocolo atualizado pelo coach
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  marginBottom: 8,
                }}
              >
                Algumas quantidades podem ter mudado desde sua última lista.
              </p>
              <button
                onClick={handleRegenerate}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#CC0000",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Regenerar lista
              </button>
            </div>
            <button
              onClick={() => setProtocolUpdatedWarning(false)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-tertiary)",
                padding: 0,
                fontSize: 16,
                lineHeight: 1,
              }}
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        )}

        {/* Aviso de ciclo de carbo ativo */}
        {hasCycle && (
          <div
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "0.5px solid rgba(251,191,36,0.25)",
              borderRadius: 10,
              padding: "9px 13px",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <i
              className="ti ti-wheat"
              style={{ fontSize: 14, color: "#fbbf24", flexShrink: 0 }}
              aria-hidden="true"
            />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              Ciclo de carbo aplicado — quantidades de carboidratos calculadas
              por dia real da semana.
            </p>
          </div>
        )}

        {/* Seletor de período */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => handleChangePeriod(p.days)}
              style={{
                flex: 1,
                padding: "7px 2px",
                borderRadius: 20,
                border:
                  days === p.days
                    ? "1.5px solid #CC0000"
                    : "0.5px solid var(--color-border-secondary)",
                background:
                  days === p.days
                    ? "rgba(204,0,0,0.1)"
                    : "var(--color-background-primary)",
                color:
                  days === p.days
                    ? "#CC0000"
                    : "var(--color-text-secondary)",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Barra de progresso */}
        {totalItems > 0 && (
          <div
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
              >
                {struckCount === totalItems
                  ? "Tudo no carrinho! 🎉"
                  : `${visibleCount} ${visibleCount === 1 ? "item" : "itens"} restantes`}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                }}
              >
                {struckCount}/{totalItems}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: "var(--color-background-secondary)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background:
                    progressPct === 100
                      ? "#34d399"
                      : "#CC0000",
                  borderRadius: 3,
                  transition: "width 0.3s ease, background 0.3s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Hint de risco (primeira vez) */}
        {struckCount === 0 && totalItems > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
            }}
          >
            <i
              className="ti ti-hand-click"
              style={{ fontSize: 16, color: "var(--color-text-tertiary)" }}
              aria-hidden="true"
            />
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-secondary)",
                lineHeight: 1.4,
              }}
            >
              Toque nos itens que você{" "}
              <strong
                style={{
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                }}
              >
                já tem em casa
              </strong>{" "}
              para riscá-los antes de enviar.
            </p>
          </div>
        )}

        {/* Grupos por macro */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {kindsWithItems.map((kind) => {
            const cfg = KIND_CFG[kind];
            const kindItems = grouped[kind];
            const kindVisible = kindItems.filter(
              (it) => !struck[`${it.kind}:${it.name}`],
            );

            return (
              <div
                key={kind}
                style={{
                  borderRadius: 12,
                  border: `0.5px solid ${cfg.border}`,
                  background: cfg.bg,
                  overflow: "hidden",
                }}
              >
                {/* Cabeçalho do grupo */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                  }}
                >
                  <i
                    className={`ti ${cfg.iconClass}`}
                    style={{ fontSize: 16, color: cfg.color }}
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      color: cfg.color,
                      flex: 1,
                    }}
                  >
                    {cfg.label}
                  </span>
                  <span
                    style={{ fontSize: 11, color: cfg.color, opacity: 0.7 }}
                  >
                    {kindVisible.length}/{kindItems.length}
                  </span>
                </div>

                {/* Itens */}
                <div style={{ borderTop: `0.5px solid ${cfg.border}` }}>
                  {kindItems.map((it) => {
                    const key = `${it.kind}:${it.name}`;
                    const isStruck = !!struck[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleStruck(key)}
                        aria-label={
                          isStruck
                            ? `Desmarcar ${it.name}`
                            : `Marcar ${it.name} como comprado`
                        }
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "11px 14px",
                          background: "transparent",
                          border: "none",
                          borderBottom: `0.5px solid ${cfg.border}`,
                          cursor: "pointer",
                          textAlign: "left",
                          opacity: isStruck ? 0.38 : 1,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            flexShrink: 0,
                            border: `0.5px solid ${isStruck ? cfg.color : "rgba(255,255,255,0.15)"}`,
                            background: isStruck ? `${cfg.color}22` : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isStruck && (
                            <i
                              className="ti ti-check"
                              style={{ fontSize: 12, color: cfg.color }}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 13,
                            color: isStruck
                              ? "var(--color-text-tertiary)"
                              : "var(--color-text-primary)",
                            textDecoration: isStruck ? "line-through" : "none",
                            transition: "all 0.2s",
                          }}
                        >
                          {it.name}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: isStruck
                              ? "var(--color-text-tertiary)"
                              : cfg.color,
                            flexShrink: 0,
                          }}
                        >
                          {formatQty(it.total, it.unit)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Seção "Já no carrinho" colapsável */}
        {struckCount > 0 && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 12,
              border: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-secondary)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setCartCollapsed((c) => !c)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                }}
              >
                Já no carrinho ({struckCount})
              </span>
              {cartCollapsed ? (
                <ChevronDown size={15} color="var(--color-text-tertiary)" />
              ) : (
                <ChevronUp size={15} color="var(--color-text-tertiary)" />
              )}
            </button>

            {!cartCollapsed && (
              <div
                style={{
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                }}
              >
                {items
                  .filter((it) => struck[`${it.kind}:${it.name}`])
                  .map((it) => {
                    const key = `${it.kind}:${it.name}`;
                    return (
                      <button
                        key={key}
                        onClick={() => toggleStruck(key)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "9px 14px",
                          background: "transparent",
                          border: "none",
                          borderBottom:
                            "0.5px solid var(--color-border-tertiary)",
                          cursor: "pointer",
                          opacity: 0.5,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--color-text-tertiary)",
                            textDecoration: "line-through",
                            flex: 1,
                            textAlign: "left",
                          }}
                        >
                          {it.name}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-tertiary)",
                            textDecoration: "line-through",
                          }}
                        >
                          {formatQty(it.total, it.unit)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Nota de rodapé */}
        <p
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            marginTop: 16,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Quantidades em peso cru · Itens riscados não aparecem no envio.
        </p>

        {/* Ações de exportação */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 16,
          }}
        >
          <button
            onClick={exportPDF}
            disabled={visibleCount === 0}
            aria-label="Exportar PDF"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "12px",
              borderRadius: 10,
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)",
              color:
                visibleCount > 0
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: visibleCount > 0 ? "pointer" : "not-allowed",
              opacity: visibleCount === 0 ? 0.5 : 1,
            }}
          >
            <FileDown size={16} /> PDF
          </button>
          <button
            onClick={shareWhatsApp}
            disabled={visibleCount === 0}
            aria-label="Compartilhar no WhatsApp"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background:
                visibleCount > 0
                  ? "#25D366"
                  : "var(--color-background-secondary)",
              color: visibleCount > 0 ? "#fff" : "var(--color-text-tertiary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: visibleCount > 0 ? "pointer" : "not-allowed",
              opacity: visibleCount === 0 ? 0.5 : 1,
            }}
          >
            <Share2 size={16} /> WhatsApp
          </button>
        </div>

        {/* Concluir compras */}
        <button
          onClick={handleComplete}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "13px",
            borderRadius: 10,
            border: "none",
            background:
              struckCount === totalItems && totalItems > 0
                ? "#34d399"
                : "rgba(52,211,153,0.12)",
            color:
              struckCount === totalItems && totalItems > 0
                ? "#fff"
                : "#34d399",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <CheckCircle2 size={16} />
          Concluir compras da semana
        </button>

        {/* Restaurar riscados */}
        {struckCount > 0 && (
          <button
            onClick={() => setStruck({})}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px",
              borderRadius: 10,
              border: "0.5px solid var(--color-border-tertiary)",
              background: "transparent",
              color: "var(--color-text-tertiary)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Restaurar {struckCount}{" "}
            {struckCount === 1 ? "item riscado" : "itens riscados"}
          </button>
        )}
      </div>
    </div>
  );
}
