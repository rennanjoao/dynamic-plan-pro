/**
 * ShoppingList.tsx — Lista de Compras v3
 *
 * Fluxo:
 *  1. Carrega protocolo ativo do aluno
 *  2. Se houver opções conflitantes (ex: azeite OU pasta de amendoim),
 *     mostra tela de escolha simples com botões grandes por nome de alimento
 *  3. Gera lista agrupada por macro (proteína, carbo, gordura, veg)
 *     com as mesmas cores da aba de dieta — zero aprendizado novo
 *  4. Aluno risca o que já tem em casa (tap no item)
 *  5. Envia o restante via WhatsApp ou PDF
 *
 * Sem duplicação de gordura/proteína entre opções alternativas.
 * Desenhado para alunos leigos com tecnologia.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, ShoppingCart, Share2, FileDown } from "lucide-react";
import jsPDF from "jspdf";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MacroKind = "protein" | "carb" | "fat" | "veg" | "other";

interface FoodItem {
  name: string;
  grams: number;
  unit: string;
}

interface ChoiceNeeded {
  /** "Refeição 2 · Gordura" */
  label: string;
  /** chave única para o mapa de escolhas */
  key: string;
  options: { idx: number; name: string }[];
}

interface AggItem {
  name: string;
  kind: MacroKind;
  grams: number;
  unit: string;
}

// ─── Configuração visual — mesmas cores da aba de dieta ───────────────────────

const KIND_CFG: Record<MacroKind, { label: string; color: string; border: string; bg: string; iconClass: string }> = {
  protein: { label: "Proteínas",        color: "#60a5fa", border: "rgba(59,130,246,0.25)",  bg: "rgba(59,130,246,0.06)",  iconClass: "ti-dna-2"   },
  carb:    { label: "Carboidratos",     color: "#fbbf24", border: "rgba(251,191,36,0.25)",  bg: "rgba(251,191,36,0.06)",  iconClass: "ti-wheat"   },
  fat:     { label: "Gorduras",         color: "#f87171", border: "rgba(248,113,113,0.25)", bg: "rgba(248,113,113,0.06)", iconClass: "ti-droplet" },
  veg:     { label: "Legumes & Saladas",color: "#34d399", border: "rgba(52,211,153,0.25)",  bg: "rgba(52,211,153,0.06)",  iconClass: "ti-salad"   },
  other:   { label: "Outros",           color: "#a3a3a3", border: "rgba(163,163,163,0.25)", bg: "rgba(163,163,163,0.06)", iconClass: "ti-package" },
};

const KIND_ORDER: MacroKind[] = ["protein", "carb", "fat", "veg", "other"];

const PERIODS = [
  { label: "1 dia",   days: 1  },
  { label: "3 dias",  days: 3  },
  { label: "1 sem",   days: 7  },
  { label: "2 sem",   days: 14 },
  { label: "1 mês",   days: 30 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function parseGrams(item: any): number {
  if (typeof item.rawWeight === "number" && item.rawWeight > 0) return item.rawWeight;
  const raw = String(item.weight ?? "").replace(",", ".").trim();
  const m = raw.match(/^([\d.]+)\s*(g|kg|ml|l)$/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === "kg") return v * 1000;
  if (u === "l")  return v * 1000;
  return v;
}

function parseUnit(item: any): string {
  const raw = String(item.weight ?? "").trim();
  const m = raw.match(/^[\d.,]+\s*(g|kg|ml|l|un|unid)/i);
  return m ? m[1].toLowerCase() : "g";
}

function formatQty(grams: number, unit: string, days: number): string {
  const total = grams * days;
  if (unit === "ml" || unit === "l") {
    return total >= 1000 ? `${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 1)} l` : `${Math.round(total)} ml`;
  }
  return total >= 1000
    ? `${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 1)} kg`
    : `${Math.round(total)} g`;
}

function kindFromStr(k: string): MacroKind {
  if (k === "protein") return "protein";
  if (k === "carb")    return "carb";
  if (k === "fat")     return "fat";
  if (k === "veg" || k === "vegetable" || k === "salad") return "veg";
  return "other";
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

/**
 * Varre o protocolo e detecta quais grupos de macro têm mais de uma opção
 * com alimentos diferentes — esses precisam de escolha do aluno.
 */
function detectChoices(meals: any[]): ChoiceNeeded[] {
  const choices: ChoiceNeeded[] = [];
  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = o?.kind || "other";
      (byKind[k] ||= []).push(o);
    });
    Object.entries(byKind).forEach(([kind, kindOpts]) => {
      if (kindOpts.length <= 1) return;
      // Verifica se as opções têm alimentos diferentes (não são só variações de peso)
      const firstNames = (kindOpts[0]?.items || []).map((it: any) =>
        stripHtml(it?.baseName || it?.name || "").toLowerCase()
      );
      const hasDiff = kindOpts.slice(1).some((o) =>
        (o?.items || []).some((it: any) =>
          !firstNames.includes(stripHtml(it?.baseName || it?.name || "").toLowerCase())
        )
      );
      if (!hasDiff) return;
      // Constrói as opções para o seletor
      const options = kindOpts.map((o, idx) => {
        const firstName = stripHtml(
          o?.items?.[0]?.baseName || o?.items?.[0]?.name || `Opção ${idx + 1}`
        );
        return { idx, name: firstName };
      });
      choices.push({
        label: `${meal.name || `Refeição ${mi + 1}`} · ${KIND_CFG[kindFromStr(kind)]?.label || kind}`,
        key: `${mi}:${kind}`,
        options,
      });
    });
  });
  return choices;
}

/**
 * Agrega alimentos com as opções já resolvidas pelo aluno.
 * selectedOptions: mapa de `${mealIdx}:${kind}` → índice da opção escolhida
 */
function aggregate(meals: any[], selectedOptions: Record<string, number>): AggItem[] {
  const acc: Record<string, AggItem> = {};
  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => { (byKind[o?.kind || "other"] ||= []).push(o); });

    Object.entries(byKind).forEach(([kind, kindOpts]) => {
      const selKey = `${mi}:${kind}`;
      const selIdx = selectedOptions[selKey] ?? 0;
      const chosen = kindOpts[Math.min(selIdx, kindOpts.length - 1)];
      if (!chosen) return;
      (chosen.items || []).forEach((it: any) => {
        const name = stripHtml(it?.baseName || it?.name || "");
        if (!name) return;
        const grams = parseGrams(it);
        if (grams === 0) return;
        const unit  = parseUnit(it);
        const macro = kindFromStr(kind);
        const key   = `${macro}:${name.toLowerCase()}`;
        if (!acc[key]) acc[key] = { name, kind: macro, grams: 0, unit };
        acc[key].grams += grams;
      });
    });
  });
  return Object.values(acc);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ShoppingList() {
  const navigate = useNavigate();
  const [protocol, setProtocol] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [days, setDays]         = useState(7);

  // Escolhas do aluno para opções conflitantes
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  // Fase: "choosing" → tela de seleção | "list" → lista pronta
  const [phase, setPhase] = useState<"choosing" | "list">("choosing");
  // Itens riscados (já tenho em casa)
  const [struck, setStruck] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) { navigate("/auth"); return; }
      const { data: p } = await supabase
        .from("protocols")
        .select("payload, name")
        .eq("student_id", data.session.user.id)
        .eq("is_template", false)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setProtocol(p);
      setLoading(false);
    });
  }, [navigate]);

  const meals: any[] = useMemo(() => {
    const m = (protocol?.payload as any)?.meals;
    return Array.isArray(m) ? m : [];
  }, [protocol]);

  const choices = useMemo(() => detectChoices(meals), [meals]);

  // Se não há conflitos, vai direto para a lista
  useEffect(() => {
    if (!loading && meals.length && choices.length === 0) {
      setPhase("list");
    }
  }, [loading, meals, choices]);

  const items = useMemo(
    () => aggregate(meals, selectedOptions),
    [meals, selectedOptions]
  );

  const grouped = useMemo(() => {
    const g: Record<MacroKind, AggItem[]> = { protein: [], carb: [], fat: [], veg: [], other: [] };
    items.forEach((it) => g[it.kind].push(it));
    return g;
  }, [items]);

  const kindsWithItems = KIND_ORDER.filter((k) => grouped[k].length > 0);

  const toggleStruck = (key: string) =>
    setStruck((s) => ({ ...s, [key]: !s[key] }));

  // ── Texto para WhatsApp / PDF ──────────────────────────────────────────────
  function buildText(): string {
    const lines = [`🛒 Lista de Compras — ${days === 1 ? "1 dia" : `${days} dias`}`, ""];
    kindsWithItems.forEach((kind) => {
      const visibleItems = grouped[kind].filter((it) => !struck[`${kind}:${it.name}`]);
      if (!visibleItems.length) return;
      lines.push(`*${KIND_CFG[kind].label}*`);
      visibleItems.forEach((it) => lines.push(`• ${it.name} — ${formatQty(it.grams, it.unit, days)}`));
      lines.push("");
    });
    return lines.join("\n");
  }

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, "_blank", "noopener,noreferrer");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    let y = 18;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(`Lista de Compras — ${days === 1 ? "1 dia" : `${days} dias`}`, 14, y); y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, 14, y); y += 8;
    kindsWithItems.forEach((kind) => {
      const visibleItems = grouped[kind].filter((it) => !struck[`${kind}:${it.name}`]);
      if (!visibleItems.length) return;
      if (y > 265) { doc.addPage(); y = 18; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(KIND_CFG[kind].label, 14, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      visibleItems.forEach((it) => {
        if (y > 280) { doc.addPage(); y = 18; }
        doc.text(`[ ]  ${it.name}`, 18, y);
        doc.text(formatQty(it.grams, it.unit, days), 180, y, { align: "right" });
        y += 6;
      });
      y += 3;
    });
    doc.save(`lista-${days}d.pdf`);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)" }}>
        <Loader2 style={{ width: 28, height: 28, color: "#CC0000" }} className="animate-spin" />
      </div>
    );
  }

  // ── Sem protocolo ──────────────────────────────────────────────────────────
  if (!meals.length) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <Link to="/student-area" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 24, textDecoration: "none" }}>
            <ArrowLeft size={15} /> Voltar
          </Link>
          <div style={cardStyle}>
            <ShoppingCart size={36} style={{ color: "var(--color-text-tertiary)", marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>Nenhum protocolo ativo</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Assim que seu coach publicar seu protocolo, sua lista aparece aqui automaticamente.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Tela de escolha ────────────────────────────────────────────────────────
  if (phase === "choosing" && choices.length > 0) {
    const allChosen = choices.every((c) => selectedOptions[c.key] !== undefined);
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", padding: "0 0 2rem" }}>
        <header style={headerStyle}>
          <button onClick={() => navigate(-1)} style={backBtnStyle}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>Lista de compras</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>O que você vai comer essa semana?</p>
          </div>
        </header>

        <div style={{ maxWidth: 480, margin: "0 auto", padding: "1.5rem 1rem" }}>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
            Seu protocolo tem algumas opções diferentes. Toque no alimento que você vai usar esta semana — a lista já vai calcular a quantidade certa para você.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {choices.map((choice) => (
              <div key={choice.key} style={cardStyle}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {choice.label}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {choice.options.map((opt) => {
                    const chosen = selectedOptions[choice.key] === opt.idx;
                    return (
                      <button
                        key={opt.idx}
                        onClick={() => setSelectedOptions((s) => ({ ...s, [choice.key]: opt.idx }))}
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          borderRadius: 10,
                          border: chosen ? "2px solid #CC0000" : "0.5px solid var(--color-border-secondary)",
                          background: chosen ? "rgba(204,0,0,0.07)" : "var(--color-background-primary)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 500, color: chosen ? "#CC0000" : "var(--color-text-primary)" }}>
                          {opt.name}
                        </span>
                        {chosen && (
                          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#CC0000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <i className="ti ti-check" style={{ fontSize: 12, color: "#fff" }} aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setPhase("list")}
            disabled={!allChosen}
            style={{
              width: "100%",
              marginTop: 24,
              padding: "14px",
              borderRadius: 10,
              border: "none",
              background: allChosen ? "#CC0000" : "var(--color-background-secondary)",
              color: allChosen ? "#fff" : "var(--color-text-tertiary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: allChosen ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {allChosen ? "Ver minha lista de compras" : "Escolha uma opção em cada campo acima"}
          </button>
        </div>
      </div>
    );
  }

  // ── Lista pronta ───────────────────────────────────────────────────────────
  const totalItems    = items.length;
  const struckCount   = items.filter((it) => struck[`${it.kind}:${it.name}`]).length;
  const visibleCount  = totalItems - struckCount;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", paddingBottom: "2rem" }}>
      <header style={headerStyle}>
        {choices.length > 0 ? (
          <button onClick={() => setPhase("choosing")} style={backBtnStyle}>
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Link to="/student-area" style={{ ...backBtnStyle, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ArrowLeft size={18} />
          </Link>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>Lista de compras</p>
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {protocol?.name || "Protocolo ativo"} · {days === 1 ? "1 dia" : `${days} dias`}
          </p>
        </div>
        <button
          onClick={shareWhatsApp}
          disabled={visibleCount === 0}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: visibleCount > 0 ? "#25D366" : "var(--color-background-secondary)",
            color: visibleCount > 0 ? "#fff" : "var(--color-text-tertiary)",
            border: "none", borderRadius: 8, padding: "7px 12px",
            fontSize: 12, fontWeight: 500, cursor: visibleCount > 0 ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
        >
          <Share2 size={14} /> Enviar
        </button>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem" }}>
        {/* Seletor de período */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              style={{
                flex: 1, padding: "7px 2px", borderRadius: 20,
                border: days === p.days ? "1.5px solid #CC0000" : "0.5px solid var(--color-border-secondary)",
                background: days === p.days ? "rgba(204,0,0,0.1)" : "var(--color-background-primary)",
                color: days === p.days ? "#CC0000" : "var(--color-text-secondary)",
                fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Hint de risco */}
        {struckCount === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
            <i className="ti ti-hand-click" style={{ fontSize: 16, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
              Toque nos alimentos que você <strong style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>já tem em casa</strong> para riscá-los antes de enviar.
            </p>
          </div>
        )}

        {/* Grupos por macro */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {kindsWithItems.map((kind) => {
            const cfg = KIND_CFG[kind];
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
                  <i className={`ti ${cfg.iconClass}`} style={{ fontSize: 16, color: cfg.color }} aria-hidden="true" />
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.09em", textTransform: "uppercase", color: cfg.color, flex: 1 }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: 11, color: cfg.color, opacity: 0.6 }}>
                    {grouped[kind].filter((it) => !struck[`${kind}:${it.name}`]).length}/{grouped[kind].length}
                  </span>
                </div>

                {/* Itens */}
                <div style={{ borderTop: `0.5px solid ${cfg.border}` }}>
                  {grouped[kind].map((it) => {
                    const key = `${kind}:${it.name}`;
                    const isStruck = !!struck[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleStruck(key)}
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
                        {/* Ícone de estado */}
                        <span style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          border: `0.5px solid ${isStruck ? cfg.color : "rgba(255,255,255,0.15)"}`,
                          background: isStruck ? `${cfg.color}22` : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isStruck && <i className="ti ti-check" style={{ fontSize: 12, color: cfg.color }} aria-hidden="true" />}
                        </span>

                        {/* Nome */}
                        <span style={{
                          flex: 1, fontSize: 13,
                          color: isStruck ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                          textDecoration: isStruck ? "line-through" : "none",
                          transition: "all 0.2s",
                        }}>
                          {it.name}
                        </span>

                        {/* Quantidade */}
                        <span style={{ fontSize: 13, fontWeight: 500, color: isStruck ? "var(--color-text-tertiary)" : cfg.color, flexShrink: 0 }}>
                          {formatQty(it.grams, it.unit, days)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nota de rodapé */}
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
          Quantidades em peso cru. Os itens riscados não aparecem na lista enviada.
        </p>

        {/* Ações */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
          <button
            onClick={exportPDF}
            disabled={visibleCount === 0}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "12px", borderRadius: 10,
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)",
              color: visibleCount > 0 ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              fontSize: 13, fontWeight: 500, cursor: visibleCount > 0 ? "pointer" : "not-allowed",
            }}
          >
            <FileDown size={16} /> PDF
          </button>
          <button
            onClick={shareWhatsApp}
            disabled={visibleCount === 0}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "12px", borderRadius: 10, border: "none",
              background: visibleCount > 0 ? "#25D366" : "var(--color-background-secondary)",
              color: visibleCount > 0 ? "#fff" : "var(--color-text-tertiary)",
              fontSize: 13, fontWeight: 500, cursor: visibleCount > 0 ? "pointer" : "not-allowed",
            }}
          >
            <Share2 size={16} /> WhatsApp
          </button>
        </div>

        {/* Restaurar riscados */}
        {struckCount > 0 && (
          <button
            onClick={() => setStruck({})}
            style={{
              width: "100%", marginTop: 10, padding: "10px",
              borderRadius: 10, border: "0.5px solid var(--color-border-tertiary)",
              background: "transparent", color: "var(--color-text-tertiary)",
              fontSize: 12, cursor: "pointer",
            }}
          >
            Restaurar {struckCount} {struckCount === 1 ? "item riscado" : "itens riscados"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Estilos compartilhados ───────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: "rgba(var(--background-rgb, 17,17,17), 0.85)",
  backdropFilter: "blur(12px)",
  borderBottom: "0.5px solid var(--color-border-tertiary)",
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const backBtnStyle: React.CSSProperties = {
  width: 32, height: 32,
  borderRadius: 8,
  border: "0.5px solid var(--color-border-secondary)",
  background: "transparent",
  display: "flex", alignItems: "center", justifyContent: "center",
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
