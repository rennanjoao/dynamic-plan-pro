/**
 * ShoppingList.tsx — Lista de Compras v5
 *
 * Melhorias v5 (foco na experiência real do aluno no mercado):
 * - Divisão de opções por dias: "4 dias frango, 3 dias patinho"
 * - "Já tenho em casa": desconta quantidade por item antes de comprar
 * - Multiplicador de pessoas (1x / 2x / 3x)
 * - Quantidades em linguagem de mercado (embalagens reais)
 * - Organização por setor do mercado (além de por macronutriente)
 * - Persistência dos riscados durante toda a semana (até domingo)
 * - Substituto rápido no item (tap longo)
 * - Aviso de embalagem mínima
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
  Users,
  Home,
  Info,
} from "lucide-react";
import jsPDF from "jspdf";
import {
  aggregateShoppingList,
  formatQty,
  stripHtml,
  parseGrams,
  parseUnit,
  BUY_BOTH,
  type AggItem,
} from "@/lib/shoppingListAgg";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MacroKind = "protein" | "carb" | "fat" | "veg" | "other";
type MarketSector = "acougue" | "hortifruti" | "laticinios" | "secos" | "freezer" | "outros";
type Phase = "choosing" | "list" | "market" | "done";
type ViewMode = "macro" | "sector";

interface ChoiceNeeded {
  label: string;
  sublabel: string;
  key: string;
  totalDays: number; // total de dias do período — para o split
  options: {
    idx: number;
    name: string;
    items: { name: string; qty: string }[];
  }[];
}

// Split de opções por dias: chave "mealIdx:kind" → mapa { optIdx → nDias }
type DaySplit = Record<string, Record<number, number>>;

interface ShoppingState {
  struck: Record<string, boolean>;
  haveAtHome: Record<string, number>; // gramas que já tem em casa
  selectedOptions: Record<string, number>;
  daySplit: DaySplit;
  period: number;
  persons: number;
  protocolUpdatedAt: string;
  generatedAt: number;
  streak: number;
  lastCompletedAt: string | null;
  weekId: string; // ISO da semana (ex: "2026-W25") — para persistência semanal
}

// ─── Configuração visual ──────────────────────────────────────────────────────

const KIND_CFG: Record<
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

// Setores do mercado e mapeamento de kinds
const SECTOR_CFG: Record<MarketSector, { label: string; emoji: string; kinds: MacroKind[] }> = {
  acougue:    { label: "Açougue & Peixaria", emoji: "🥩", kinds: ["protein"] },
  hortifruti: { label: "Hortifruti",          emoji: "🥦", kinds: ["veg"] },
  laticinios: { label: "Laticínios & Ovos",   emoji: "🥚", kinds: [] }, // detectado por nome
  secos:      { label: "Secos & Grãos",       emoji: "🌾", kinds: ["carb"] },
  freezer:    { label: "Freezer",             emoji: "🧊", kinds: [] }, // detectado por nome
  outros:     { label: "Óleos & Outros",      emoji: "🫙", kinds: ["fat", "other"] },
};

const SECTOR_ORDER: MarketSector[] = ["acougue", "laticinios", "hortifruti", "secos", "outros", "freezer"];

// Palavras-chave para detectar setor por nome do item
const LATICINIOS_KEYWORDS = /leite|queijo|iogurte|requeijão|manteiga|coalhada|whey|caseína|ovo|clara/i;
const FREEZER_KEYWORDS = /congelad|frozen|tilápia congelada|salmão congelado/i;

function kindToSector(item: AggItem): MarketSector {
  const name = item.name.toLowerCase();
  if (FREEZER_KEYWORDS.test(name)) return "freezer";
  if (LATICINIOS_KEYWORDS.test(name)) return "laticinios";
  const kind = kindFromStr(item.kind);
  for (const [sector, cfg] of Object.entries(SECTOR_CFG) as [MarketSector, typeof SECTOR_CFG[MarketSector]][]) {
    if (cfg.kinds.includes(kind)) return sector;
  }
  return "outros";
}

const PERIODS = [
  { label: "1 dia",  days: 1  },
  { label: "3 dias", days: 3  },
  { label: "1 sem",  days: 7  },
  { label: "2 sem",  days: 14 },
  { label: "1 mês",  days: 30 },
];

// Embalagens típicas de mercado (g) para aviso de embalagem mínima
const PACKAGE_HINTS: { pattern: RegExp; unit: string; size: number }[] = [
  { pattern: /arroz|feijão|aveia|lentilha|quinoa|grão/i,   unit: "pacote", size: 1000 },
  { pattern: /macarrão|massa|espaguete/i,                   unit: "pacote", size: 500  },
  { pattern: /frango|peito|coxinha|sobrecoxa/i,             unit: "bandeja", size: 1000 },
  { pattern: /patinho|alcatra|carne|picanha|contrafilé/i,   unit: "bandeja", size: 500  },
  { pattern: /azeite|óleo/i,                                unit: "garrafa", size: 500  },
  { pattern: /atum/i,                                       unit: "lata", size: 170    },
  { pattern: /leite/i,                                      unit: "caixa", size: 1000  },
  { pattern: /whey/i,                                       unit: "dose",  size: 30    },
];

function getPackageHint(name: string, totalGrams: number): string | null {
  const match = PACKAGE_HINTS.find((h) => h.pattern.test(name));
  if (!match) return null;
  if (totalGrams >= match.size) return null; // compra pelo menos 1 embalagem
  const qty = Math.ceil(totalGrams / match.size);
  return `Mínimo: ${qty} ${match.unit} (${match.size >= 1000 ? `${match.size / 1000}kg` : `${match.size}g`})`;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function currentWeekId(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function stateKey(userId: string, protocolId: string) {
  return `shopping_state_v5_${userId}_${protocolId}`;
}

function loadState(userId: string, protocolId: string): ShoppingState | null {
  try {
    const raw = localStorage.getItem(stateKey(userId, protocolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShoppingState;
    // Riscados persistem apenas durante a semana atual
    if (parsed.weekId !== currentWeekId()) {
      return { ...parsed, struck: {}, haveAtHome: {}, weekId: currentWeekId() };
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveState(userId: string, protocolId: string, state: ShoppingState) {
  try {
    localStorage.setItem(stateKey(userId, protocolId), JSON.stringify(state));
  } catch { /* noop */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kindFromStr(k: string): MacroKind {
  if (k === "protein") return "protein";
  if (k === "carb") return "carb";
  if (k === "fat") return "fat";
  if (k === "veg" || k === "vegetable" || k === "salad") return "veg";
  return "other";
}

function detectChoices(meals: any[], days: number): ChoiceNeeded[] {
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
            !firstNames.includes(stripHtml(it?.baseName || it?.name || "").toLowerCase()),
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
        totalDays: days,
        options,
      });
    });
  });

  return choices;
}

function hasCarbCycleActive(carbCycle: Record<string, unknown>): boolean {
  return (
    Object.keys(carbCycle).length > 0 &&
    Object.values(carbCycle).some((v) => v === "high" || v === "off" || v === "low")
  );
}

function calcStreak(lastCompletedAt: string | null, prevStreak: number): number {
  if (!lastCompletedAt) return 0;
  const diffDays = Math.floor(
    (Date.now() - new Date(lastCompletedAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  return diffDays <= 8 ? prevStreak + 1 : 1;
}

// Agrega com suporte a day-split: cada opção contribui proporcionalmente aos dias escolhidos
function aggregateWithSplit(params: {
  meals: any[];
  selectedOptions: Record<string, number>;
  daySplit: DaySplit;
  days: number;
  persons: number;
  carbCycle: Record<string, unknown>;
  carbCycleHighPct: number;
  carbCycleLowPct: number;
}): AggItem[] {
  const { meals, selectedOptions, daySplit, days, persons, ...rest } = params;

  // Verifica se há algum split ativo
  const hasSplit = Object.keys(daySplit).length > 0;

  if (!hasSplit) {
    // Sem split: comportamento original
    const items = aggregateShoppingList({ meals, selectedOptions, days, ...rest });
    return items.map((it) => ({
      ...it,
      total: it.total * persons,
      gramsPerDay: it.gramsPerDay * persons,
    }));
  }

  // Com split: chama aggregateShoppingList múltiplas vezes, uma por opção de cada split
  // e combina os resultados proporcionalmente aos dias
  const combined = new Map<string, AggItem>();

  // Processa opções COM split
  Object.entries(daySplit).forEach(([choiceKey, splitMap]) => {
    Object.entries(splitMap).forEach(([optIdxStr, daysForOpt]) => {
      if (!daysForOpt || daysForOpt <= 0) return;
      const optIdx = Number(optIdxStr);
      const sel = { ...selectedOptions, [choiceKey]: optIdx };
      const subItems = aggregateShoppingList({
        meals,
        selectedOptions: sel,
        days: daysForOpt,
        ...rest,
      });
      subItems.forEach((it) => {
        const k = `${it.kind}:${it.name}`;
        const existing = combined.get(k);
        if (existing) {
          existing.total += it.total;
          existing.gramsPerDay = existing.total / days;
        } else {
          combined.set(k, { ...it });
        }
      });
    });
  });

  // Processa opções SEM split (usa selectedOptions normal)
  const splitKeys = new Set(Object.keys(daySplit));
  const mealsWithoutSplit = meals.map((meal, mi) => {
    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = o?.kind || "other";
      (byKind[k] ||= []).push(o);
    });
    const filteredOpts = opts.filter((o) => {
      const k = o?.kind || "other";
      const choiceKey = `${mi}:${k}`;
      return !splitKeys.has(choiceKey) || (byKind[k] || []).length <= 1;
    });
    return { ...meal, options: filteredOpts };
  });

  const baseItems = aggregateShoppingList({
    meals: mealsWithoutSplit,
    selectedOptions,
    days,
    ...rest,
  });

  baseItems.forEach((it) => {
    const k = `${it.kind}:${it.name}`;
    const existing = combined.get(k);
    if (existing) {
      existing.total += it.total;
      existing.gramsPerDay = existing.total / days;
    } else {
      combined.set(k, { ...it });
    }
  });

  return Array.from(combined.values()).map((it) => ({
    ...it,
    total: it.total * persons,
    gramsPerDay: it.gramsPerDay * persons,
  }));
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

// ─── Sub-componente: DaySplitPicker ──────────────────────────────────────────

interface DaySplitPickerProps {
  choice: ChoiceNeeded;
  split: Record<number, number>;
  onChange: (split: Record<number, number>) => void;
}

function DaySplitPicker({ choice, split, onChange }: DaySplitPickerProps) {
  const total = choice.totalDays;
  const usedDays = Object.values(split).reduce((a, b) => a + b, 0);
  const remaining = total - usedDays;

  const handleChange = (optIdx: number, val: number) => {
    const newSplit = { ...split };
    const others = Object.entries(newSplit)
      .filter(([k]) => Number(k) !== optIdx)
      .reduce((sum, [, v]) => sum + v, 0);
    const clamped = Math.max(0, Math.min(val, total - others));
    newSplit[optIdx] = clamped;
    onChange(newSplit);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Indicador visual dos dias */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
        {Array.from({ length: total }).map((_, i) => {
          // Determina qual opção "dono" deste dia
          let dayOwner = -1;
          let count = 0;
          for (const [k, v] of Object.entries(split)) {
            count += v;
            if (i < count) { dayOwner = Number(k); break; }
          }
          const cfg = dayOwner >= 0 ? KIND_CFG[kindFromStr(choice.key.split(":")[1] || "other")] : null;
          return (
            <div
              key={i}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: cfg ? cfg.color + "33" : "var(--color-background-secondary)",
                border: `1px solid ${cfg ? cfg.color + "66" : "var(--color-border-tertiary)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: cfg ? cfg.color : "var(--color-text-tertiary)",
                fontWeight: 500,
              }}
            >
              {i + 1}
            </div>
          );
        })}
      </div>

      {remaining > 0 && (
        <p style={{ fontSize: 11, color: "#fbbf24", marginBottom: 4 }}>
          ⚠️ {remaining} {remaining === 1 ? "dia sem opção definida" : "dias sem opção definida"}
        </p>
      )}

      {choice.options.map((opt) => (
        <div
          key={opt.idx}
          style={{
            background: "var(--color-background-primary)",
            border: `0.5px solid ${(split[opt.idx] || 0) > 0 ? "#CC0000" : "var(--color-border-secondary)"}`,
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
              {opt.name}
            </span>
            <span style={{ fontSize: 12, color: "#CC0000", fontWeight: 600 }}>
              {split[opt.idx] || 0}d
            </span>
          </div>

          {/* Stepper de dias */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => handleChange(opt.idx, (split[opt.idx] || 0) - 1)}
              disabled={(split[opt.idx] || 0) <= 0}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 18, cursor: "pointer",
                opacity: (split[opt.idx] || 0) <= 0 ? 0.3 : 1,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >−</button>

            <div style={{
              flex: 1, height: 6, borderRadius: 3,
              background: "var(--color-background-secondary)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 3, background: "#CC0000",
                width: `${((split[opt.idx] || 0) / total) * 100}%`,
                transition: "width 0.2s",
              }} />
            </div>

            <button
              onClick={() => handleChange(opt.idx, (split[opt.idx] || 0) + 1)}
              disabled={remaining <= 0 && (split[opt.idx] || 0) === (split[opt.idx] || 0)}
              style={{
                width: 36, height: 36, borderRadius: 8,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 18, cursor: "pointer",
                opacity: remaining <= 0 ? 0.3 : 1,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >+</button>
          </div>

          {opt.items.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
              {opt.items.map((item, ii) => (
                <div key={ii} style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 11, color: "var(--color-text-secondary)",
                }}>
                  <span>{item.name}</span>
                  {item.qty && <span style={{ fontWeight: 500 }}>{item.qty}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Sub-componente: HaveAtHomeSlider ────────────────────────────────────────

interface HaveAtHomeSliderProps {
  item: AggItem;
  value: number; // gramas que já tem em casa
  onChange: (g: number) => void;
  onClose: () => void;
}

function HaveAtHomeSlider({ item, value, onChange, onClose }: HaveAtHomeSliderProps) {
  const max = item.total;
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      zIndex: 50, display: "flex", alignItems: "flex-end",
    }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, margin: "0 auto",
          background: "var(--color-background-primary)",
          borderRadius: "16px 16px 0 0",
          padding: "20px 20px 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Home size={16} color="#34d399" />
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Já tenho em casa
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-tertiary)" }}>×</button>
        </div>

        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
          {item.name}
        </p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 20 }}>
          Protocolo pede: <strong>{formatQty(item.total, item.unit)}</strong>
        </p>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Quanto você já tem?</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#34d399" }}>
            {formatQty(value, item.unit)} ({pct}%)
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={max}
          step={Math.max(1, Math.round(max / 20))}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#34d399", marginBottom: 12 }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 20 }}>
          <span>0</span>
          <span>{formatQty(max, item.unit)}</span>
        </div>

        {value > 0 && (
          <div style={{
            background: "rgba(52,211,153,0.08)", border: "0.5px solid rgba(52,211,153,0.25)",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, color: "#34d399" }}>
              Você vai comprar: <strong>{formatQty(Math.max(0, item.total - value), item.unit)}</strong>
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => { onChange(0); onClose(); }}
            style={{
              flex: 1, padding: "12px", borderRadius: 10,
              border: "0.5px solid var(--color-border-secondary)",
              background: "transparent", color: "var(--color-text-secondary)",
              fontSize: 13, cursor: "pointer",
            }}
          >
            Limpar
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 2, padding: "12px", borderRadius: 10,
              border: "none", background: "#34d399",
              color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ShoppingList() {
  const navigate = useNavigate();

  const [protocol, setProtocol] = useState<any>(null);
  const [protocolId, setProtocolId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [days, setDays] = useState(7);
  const [persons, setPersons] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [daySplit, setDaySplit] = useState<DaySplit>({});
  const [phase, setPhase] = useState<Phase>("choosing");
  const [struck, setStruck] = useState<Record<string, boolean>>({});
  const [haveAtHome, setHaveAtHome] = useState<Record<string, number>>({});
  const [cartCollapsed, setCartCollapsed] = useState(true);
  const [streak, setStreak] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [choiceStep, setChoiceStep] = useState(0);
  const [protocolUpdatedWarning, setProtocolUpdatedWarning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("macro");
  const [haveAtHomeItem, setHaveAtHomeItem] = useState<AggItem | null>(null);
  const [splitMode, setSplitMode] = useState(false); // se o choice atual está no modo split

  const stateRef = useRef<ShoppingState | null>(null);

  // ── Carrega protocolo e estado salvo ────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) { navigate("/auth"); return; }
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
          if (p.updated_at && saved.generatedAt && new Date(p.updated_at).getTime() > saved.generatedAt) {
            setProtocolUpdatedWarning(true);
          }
          setSelectedOptions(saved.selectedOptions || {});
          setDaySplit(saved.daySplit || {});
          setDays(saved.period || 7);
          setPersons(saved.persons || 1);
          setStruck(saved.struck || {});
          setHaveAtHome(saved.haveAtHome || {});
          setStreak(saved.streak || 0);
          setLastCompletedAt(saved.lastCompletedAt || null);
          stateRef.current = saved;
        }
      }

      setLoading(false);
    });
  }, [navigate]);

  // ── Dados do protocolo ───────────────────────────────────────────────────────
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

  const choices = useMemo(() => detectChoices(meals, days), [meals, days]);
  const hasCycle = useMemo(() => hasCarbCycleActive(carbCycle), [carbCycle]);

  useEffect(() => {
    if (!loading && meals.length > 0 && choices.length === 0) setPhase("list");
  }, [loading, meals, choices]);

  // ── Agregação com split e "já tenho" ─────────────────────────────────────────
  const rawItems: AggItem[] = useMemo(
    () =>
      aggregateWithSplit({
        meals,
        selectedOptions,
        daySplit,
        days,
        persons,
        carbCycle,
        carbCycleHighPct,
        carbCycleLowPct,
      }),
    [meals, selectedOptions, daySplit, days, persons, carbCycle, carbCycleHighPct, carbCycleLowPct],
  );

  // Aplica "já tenho em casa"
  const items: AggItem[] = useMemo(() =>
    rawItems.map((it) => {
      const k = `${it.kind}:${it.name}`;
      const have = haveAtHome[k] || 0;
      const netTotal = Math.max(0, it.total - have);
      return { ...it, total: netTotal };
    }),
    [rawItems, haveAtHome],
  );

  const grouped = useMemo(() => {
    const g: Record<MacroKind, AggItem[]> = { protein: [], carb: [], fat: [], veg: [], other: [] };
    items.forEach((it) => g[kindFromStr(it.kind)].push(it));
    return g;
  }, [items]);

  const groupedBySector = useMemo(() => {
    const g: Record<MarketSector, AggItem[]> = { acougue: [], hortifruti: [], laticinios: [], secos: [], freezer: [], outros: [] };
    items.forEach((it) => g[kindToSector(it)].push(it));
    return g;
  }, [items]);

  const kindsWithItems = KIND_ORDER.filter((k) => grouped[k].length > 0);
  const sectorsWithItems = SECTOR_ORDER.filter((s) => groupedBySector[s].length > 0);

  const totalItems = items.length;
  const struckCount = items.filter((it) => struck[`${it.kind}:${it.name}`]).length;
  const visibleCount = totalItems - struckCount;
  const haveAtHomeCount = Object.values(haveAtHome).filter((v) => v > 0).length;

  // ── Persiste estado ──────────────────────────────────────────────────────────
  const persistState = useCallback(() => {
    if (!userId || !protocolId) return;
    const state: ShoppingState = {
      struck,
      haveAtHome,
      selectedOptions,
      daySplit,
      period: days,
      persons,
      protocolUpdatedAt: protocol?.updated_at || "",
      generatedAt: stateRef.current?.generatedAt || Date.now(),
      streak,
      lastCompletedAt,
      weekId: currentWeekId(),
    };
    stateRef.current = state;
    saveState(userId, protocolId, state);
  }, [userId, protocolId, struck, haveAtHome, selectedOptions, daySplit, days, persons, protocol, streak, lastCompletedAt]);

  useEffect(() => {
    if (phase === "list" || phase === "market") persistState();
  }, [struck, haveAtHome, selectedOptions, daySplit, days, persons, phase, persistState]);

  // ── Interações ───────────────────────────────────────────────────────────────
  const toggleStruck = useCallback((key: string) => {
    setStruck((s) => ({ ...s, [key]: !s[key] }));
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  const handleComplete = useCallback(() => {
    const now = new Date().toISOString();
    const newStreak = calcStreak(lastCompletedAt, streak);
    setStreak(newStreak);
    setLastCompletedAt(now);

    if (userId && protocolId) {
      const state: ShoppingState = {
        struck, haveAtHome, selectedOptions, daySplit, period: days, persons,
        protocolUpdatedAt: protocol?.updated_at || "",
        generatedAt: stateRef.current?.generatedAt || Date.now(),
        streak: newStreak, lastCompletedAt: now, weekId: currentWeekId(),
      };
      stateRef.current = state;
      saveState(userId, protocolId, state);

      (async () => {
        try {
          await (supabase as any).from("shopping_sessions").insert({
            user_id: userId, protocol_id: protocolId,
            period_days: days, items_total: totalItems,
            items_completed: struckCount,
            completed: visibleCount === 0, streak: newStreak,
          });
        } catch { /* falha silenciosa */ }
      })();
    }

    setPhase("done");
  }, [userId, protocolId, struck, haveAtHome, selectedOptions, daySplit, days, persons, protocol, streak, lastCompletedAt, totalItems, struckCount, visibleCount]);

  // ── Exportação ───────────────────────────────────────────────────────────────
  function buildText(): string {
    const personsSuffix = persons > 1 ? ` · ${persons} pessoas` : "";
    const header = `🛒 Lista de Compras — ${days === 1 ? "1 dia" : `${days} dias`}${personsSuffix}`;
    const lines = [header, ""];
    kindsWithItems.forEach((kind) => {
      const visibleItems = grouped[kind].filter((it) => !struck[`${it.kind}:${it.name}`]);
      if (!visibleItems.length) return;
      lines.push(`*${KIND_CFG[kind].label}*`);
      visibleItems.forEach((it) => lines.push(`• ${it.name} — ${formatQty(it.total, it.unit)}`));
      lines.push("");
    });
    lines.push("_Quantidades em peso cru · Elite Prime Hub_");
    return lines.join("\n");
  }

  const shareWhatsApp = () => {
    if (visibleCount === 0) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, "_blank", "noopener,noreferrer");
  };

  const exportPDF = () => {
    if (visibleCount === 0) return;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 18;

    doc.setFillColor(204, 0, 0);
    doc.rect(0, 0, pageW, 12, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(`Lista de Compras — ${days === 1 ? "1 dia" : `${days} dias`}${persons > 1 ? ` · ${persons}p` : ""}`, 14, 8.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${new Date().toLocaleDateString("pt-BR")} · ${protocol?.name || "Protocolo ativo"}`, pageW - 14, 8.5, { align: "right" });
    y = 22;

    const colorMap: Record<MacroKind, [number, number, number]> = {
      protein: [59, 130, 246], carb: [251, 191, 36],
      fat: [248, 113, 113], veg: [52, 211, 153], other: [163, 163, 163],
    };

    kindsWithItems.forEach((kind) => {
      const visibleItems = grouped[kind].filter((it) => !struck[`${it.kind}:${it.name}`]);
      if (!visibleItems.length) return;
      if (y > 265) { doc.addPage(); y = 18; }
      const [r, g, b] = colorMap[kind];
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
        if (y > 280) { doc.addPage(); y = 18; }
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

    if (y < 275) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Quantidades em peso cru · Elite Prime Hub", 14, 287);
    }

    doc.save(`lista-${days}d-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Navegação de choices ──────────────────────────────────────────────────────
  const currentChoice = choices[choiceStep];
  const currentSplit = currentChoice ? (daySplit[currentChoice.key] || {}) : {};
  const splitDaysUsed = Object.values(currentSplit).reduce((a, b) => a + b, 0);

  const choiceIsResolved = currentChoice
    ? (splitMode
      ? splitDaysUsed === days
      : selectedOptions[currentChoice.key] !== undefined)
    : false;

  const buyBothSelected = currentChoice
    ? selectedOptions[currentChoice.key] === BUY_BOTH
    : false;

  const handleNextChoice = () => {
    if (choiceStep < choices.length - 1) {
      setChoiceStep((s) => s + 1);
      setSplitMode(false);
    } else {
      if (!stateRef.current?.generatedAt) {
        stateRef.current = {
          struck: {}, haveAtHome: {}, selectedOptions, daySplit,
          period: days, persons,
          protocolUpdatedAt: protocol?.updated_at || "",
          generatedAt: Date.now(), streak, lastCompletedAt, weekId: currentWeekId(),
        };
      }
      stateRef.current.generatedAt = Date.now();
      setPhase("list");
    }
  };

  const handlePrevChoice = () => {
    if (choiceStep > 0) { setChoiceStep((s) => s - 1); setSplitMode(false); }
  };

  const handleChangePeriod = (newDays: number) => {
    if (newDays === days) return;
    if (struckCount > 0) setStruck({});
    setDays(newDays);
    setDaySplit({}); // reset splits ao mudar período
  };

  const handleRegenerate = () => {
    setStruck({});
    setSelectedOptions({});
    setDaySplit({});
    setChoiceStep(0);
    setSplitMode(false);
    setProtocolUpdatedWarning(false);
    if (stateRef.current) stateRef.current.generatedAt = Date.now();
    setPhase(choices.length === 0 ? "list" : "choosing");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)" }}>
        <Loader2 style={{ width: 28, height: 28, color: "#CC0000" }} className="animate-spin" />
      </div>
    );
  }

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

  // ── Tela de conclusão ────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(52,211,153,0.12)", border: "0.5px solid rgba(52,211,153,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle2 size={36} style={{ color: "#34d399" }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>Compras concluídas!</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20 }}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          {streak >= 2 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(251,146,60,0.1)", border: "0.5px solid rgba(251,146,60,0.3)", borderRadius: 20, padding: "6px 14px", marginBottom: 20 }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#f97316" }}>{streak} semanas de compras organizadas</span>
            </div>
          )}
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "14px 16px", marginBottom: 24, display: "flex", justifyContent: "space-around" }}>
            {[
              { val: totalItems, label: "itens comprados" },
              { val: `${days}d`, label: "de protocolo" },
              { val: persons > 1 ? `${persons}p` : kindsWithItems.length, label: persons > 1 ? "pessoas" : "categorias" },
            ].map((stat, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)" }}>{stat.val}</p>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{stat.label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/student-area")} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#CC0000", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // ── Modo mercado ─────────────────────────────────────────────────────────────
  if (phase === "market") {
    const pendingItems = items.filter((it) => !struck[`${it.kind}:${it.name}`]);
    const doneItems = items.filter((it) => struck[`${it.kind}:${it.name}`]);

    // No modo mercado, organiza por setor
    const pendingBySector: Record<MarketSector, AggItem[]> = { acougue: [], hortifruti: [], laticinios: [], secos: [], freezer: [], outros: [] };
    pendingItems.forEach((it) => pendingBySector[kindToSector(it)].push(it));
    const activeSectors = SECTOR_ORDER.filter((s) => pendingBySector[s].length > 0);

    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", paddingBottom: "2rem" }}>
        <header style={headerStyle}>
          <button onClick={() => setPhase("list")} style={backBtnStyle}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>🛒 No mercado</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              {pendingItems.length > 0 ? `${pendingItems.length} ${pendingItems.length === 1 ? "item" : "itens"} para pegar` : "Tudo no carrinho!"}
            </p>
          </div>
          {pendingItems.length === 0 && (
            <button onClick={handleComplete} style={{ background: "#34d399", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Concluir
            </button>
          )}
        </header>

        <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem", display: "flex", flexDirection: "column", gap: 12 }}>
          {activeSectors.map((sector) => {
            const cfg = SECTOR_CFG[sector];
            return (
              <div key={sector}>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, paddingLeft: 4 }}>
                  {cfg.emoji} {cfg.label}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pendingBySector[sector].map((it) => {
                    const key = `${it.kind}:${it.name}`;
                    const cfg2 = KIND_CFG[kindFromStr(it.kind)];
                    const packageHint = getPackageHint(it.name, it.total);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleStruck(key)}
                        style={{ width: "100%", background: "var(--color-background-primary)", border: `0.5px solid ${cfg2.border}`, borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 12, textAlign: "left" }}
                      >
                        <div>
                          <span style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", display: "block" }}>{it.name}</span>
                          {packageHint && <span style={{ fontSize: 11, color: "#fbbf24", display: "block", marginTop: 2 }}>📦 {packageHint}</span>}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 600, color: cfg2.color, flexShrink: 0 }}>
                          {formatQty(it.total, it.unit)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {doneItems.length > 0 && (
            <div style={{ marginTop: 8, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "12px 16px" }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Já no carrinho ({doneItems.length})
              </p>
              {doneItems.map((it) => {
                const key = `${it.kind}:${it.name}`;
                return (
                  <button key={key} onClick={() => toggleStruck(key)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", padding: "6px 0", cursor: "pointer", opacity: 0.5 }}>
                    <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", textDecoration: "line-through" }}>{it.name}</span>
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", textDecoration: "line-through" }}>{formatQty(it.total, it.unit)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button onClick={() => setPhase("list")} style={{ marginTop: 8, width: "100%", padding: "11px", borderRadius: 10, border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>
            Sair do modo mercado
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de escolha de opções ─────────────────────────────────────────────────
  if (phase === "choosing" && choices.length > 0) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", padding: "0 0 2rem" }}>
        <header style={headerStyle}>
          <button onClick={() => choiceStep > 0 ? handlePrevChoice() : navigate(-1)} style={backBtnStyle}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>O que você vai usar?</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              {choiceStep + 1} de {choices.length} {choices.length === 1 ? "escolha" : "escolhas"}
            </p>
          </div>
        </header>

        <div style={{ height: 3, background: "var(--color-background-secondary)" }}>
          <div style={{ height: "100%", width: `${((choiceStep + (choiceIsResolved ? 1 : 0)) / choices.length) * 100}%`, background: "#CC0000", transition: "width 0.3s ease" }} />
        </div>

        <div style={{ maxWidth: 480, margin: "0 auto", padding: "1.5rem 1rem" }}>
          {currentChoice && (
            <>
              {/* Contexto */}
              <div style={{ background: "rgba(204,0,0,0.06)", border: "0.5px solid rgba(204,0,0,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#CC0000", marginBottom: currentChoice.sublabel ? 2 : 0 }}>{currentChoice.label}</p>
                {currentChoice.sublabel && <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>🕐 {currentChoice.sublabel}</p>}
              </div>

              {/* Toggle simples / split de dias */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  onClick={() => setSplitMode(false)}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: !splitMode ? "1.5px solid #CC0000" : "0.5px solid var(--color-border-secondary)", background: !splitMode ? "rgba(204,0,0,0.08)" : "var(--color-background-primary)", color: !splitMode ? "#CC0000" : "var(--color-text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Uma opção p/ semana
                </button>
                <button
                  onClick={() => setSplitMode(true)}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: splitMode ? "1.5px solid #CC0000" : "0.5px solid var(--color-border-secondary)", background: splitMode ? "rgba(204,0,0,0.08)" : "var(--color-background-primary)", color: splitMode ? "#CC0000" : "var(--color-text-secondary)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Dividir por dias
                </button>
              </div>

              {splitMode ? (
                <DaySplitPicker
                  choice={currentChoice}
                  split={currentSplit}
                  onChange={(newSplit) => setDaySplit((d) => ({ ...d, [currentChoice.key]: newSplit }))}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {currentChoice.options.map((opt) => {
                    const chosen =
                      !buyBothSelected &&
                      selectedOptions[currentChoice.key] === opt.idx;
                    return (
                      <button
                        key={opt.idx}
                        onClick={() => setSelectedOptions((s) => ({ ...s, [currentChoice.key]: opt.idx }))}
                        style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: chosen ? "2px solid #CC0000" : "0.5px solid var(--color-border-secondary)", background: chosen ? "rgba(204,0,0,0.07)" : "var(--color-background-primary)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: opt.items.length > 0 ? 8 : 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: chosen ? "#CC0000" : "var(--color-text-primary)" }}>{opt.name}</span>
                          {chosen && (
                            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#CC0000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <i className="ti ti-check" style={{ fontSize: 11, color: "#fff" }} aria-hidden="true" />
                            </span>
                          )}
                        </div>
                        {opt.items.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {opt.items.map((item, ii) => (
                              <div key={ii} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: chosen ? "rgba(204,0,0,0.7)" : "var(--color-text-secondary)" }}>
                                <span>{item.name}</span>
                                {item.qty && <span style={{ fontWeight: 500 }}>{item.qty}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}

                  {/* Comprar as duas opções (outline) */}
                  {currentChoice.options.length >= 2 && (
                    <button
                      onClick={() =>
                        setSelectedOptions((s) => ({
                          ...s,
                          [currentChoice.key]: BUY_BOTH,
                        }))
                      }
                      aria-pressed={buyBothSelected}
                      aria-label="Comprar as duas opções"
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 12,
                        border: buyBothSelected
                          ? "2px solid #CC0000"
                          : "1px dashed var(--color-border-secondary)",
                        background: buyBothSelected
                          ? "rgba(204,0,0,0.07)"
                          : "transparent",
                        color: buyBothSelected ? "#CC0000" : "var(--color-text-secondary)",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        transition: "all 0.15s",
                      }}
                    >
                      <i className="ti ti-plus" style={{ fontSize: 13 }} aria-hidden="true" />
                      Comprar as {currentChoice.options.length === 2 ? "duas" : `${currentChoice.options.length}`} opções
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleNextChoice}
                disabled={!choiceIsResolved}
                style={{ width: "100%", marginTop: 20, padding: "14px", borderRadius: 10, border: "none", background: choiceIsResolved ? "#CC0000" : "var(--color-background-secondary)", color: choiceIsResolved ? "#fff" : "var(--color-text-tertiary)", fontSize: 14, fontWeight: 500, cursor: choiceIsResolved ? "pointer" : "not-allowed", transition: "all 0.2s" }}
              >
                {choiceStep < choices.length - 1 ? "Próxima →" : "Ver minha lista de compras"}
              </button>

              {!choiceIsResolved && (
                <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 10 }}>
                  {splitMode ? `Distribua os ${days} dias entre as opções` : "Selecione uma opção para continuar"}
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

  const renderItemRow = (it: AggItem, containerBorder: string, containerColor: string) => {
    const key = `${it.kind}:${it.name}`;
    const isStruck = !!struck[key];
    const have = haveAtHome[key] || 0;
    const rawTotal = rawItems.find((r) => `${r.kind}:${r.name}` === key)?.total || it.total;
    const packageHint = getPackageHint(it.name, it.total);

    return (
      <div
        key={key}
        style={{ borderBottom: `0.5px solid ${containerBorder}`, opacity: isStruck ? 0.38 : 1, transition: "opacity 0.2s" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
          {/* Checkbox */}
          <button
            onClick={() => toggleStruck(key)}
            aria-label={isStruck ? `Desmarcar ${it.name}` : `Marcar ${it.name}`}
            style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: `0.5px solid ${isStruck ? containerColor : "rgba(255,255,255,0.15)"}`, background: isStruck ? `${containerColor}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            {isStruck && <i className="ti ti-check" style={{ fontSize: 12, color: containerColor }} aria-hidden="true" />}
          </button>

          {/* Nome + hint */}
          <div style={{ flex: 1, textAlign: "left" }}>
            <span style={{ fontSize: 13, color: isStruck ? "var(--color-text-tertiary)" : "var(--color-text-primary)", textDecoration: isStruck ? "line-through" : "none", transition: "all 0.2s", display: "block" }}>
              {it.name}
            </span>
            {have > 0 && !isStruck && (
              <span style={{ fontSize: 10, color: "#34d399", display: "block", marginTop: 1 }}>
                🏠 Desconto: {formatQty(have, it.unit)} já em casa
              </span>
            )}
            {packageHint && !isStruck && (
              <span style={{ fontSize: 10, color: "#fbbf24", display: "block", marginTop: 1 }}>📦 {packageHint}</span>
            )}
          </div>

          {/* Quantidade */}
          <span style={{ fontSize: 13, fontWeight: 500, color: isStruck ? "var(--color-text-tertiary)" : containerColor, flexShrink: 0 }}>
            {formatQty(it.total, it.unit)}
          </span>

          {/* Botão "já tenho em casa" */}
          {!isStruck && (
            <button
              onClick={() => setHaveAtHomeItem(it)}
              aria-label={`Já tenho ${it.name} em casa`}
              style={{ width: 26, height: 26, borderRadius: 6, border: `0.5px solid ${have > 0 ? "#34d399" : "var(--color-border-tertiary)"}`, background: have > 0 ? "rgba(52,211,153,0.1)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <Home size={12} color={have > 0 ? "#34d399" : "var(--color-text-tertiary)"} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", paddingBottom: "2rem" }}>
      {/* Modal "já tenho em casa" */}
      {haveAtHomeItem && (
        <HaveAtHomeSlider
          item={haveAtHomeItem}
          value={haveAtHome[`${haveAtHomeItem.kind}:${haveAtHomeItem.name}`] || 0}
          onChange={(g) => {
            const k = `${haveAtHomeItem.kind}:${haveAtHomeItem.name}`;
            setHaveAtHome((h) => ({ ...h, [k]: g }));
          }}
          onClose={() => setHaveAtHomeItem(null)}
        />
      )}

      <header style={headerStyle}>
        {choices.length > 0 ? (
          <button onClick={() => { setChoiceStep(choices.length - 1); setPhase("choosing"); }} style={backBtnStyle} aria-label="Voltar às escolhas">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Link to="/student-area" style={{ ...backBtnStyle, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Voltar">
            <ArrowLeft size={18} />
          </Link>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>Lista de compras</p>
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {protocol?.name || "Protocolo ativo"} · {days === 1 ? "1 dia" : `${days} dias`}{persons > 1 ? ` · ${persons} pessoas` : ""}
          </p>
        </div>
        <button
          onClick={() => setPhase("market")}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(204,0,0,0.1)", color: "#CC0000", border: "0.5px solid rgba(204,0,0,0.3)", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          aria-label="Modo mercado"
        >
          <ShoppingBag size={13} /> Mercado
        </button>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "1rem" }}>

        {/* Aviso de protocolo atualizado */}
        {protocolUpdatedWarning && (
          <div style={{ background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.35)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>Protocolo atualizado pelo coach</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>Algumas quantidades podem ter mudado desde sua última lista.</p>
              <button onClick={handleRegenerate} style={{ fontSize: 12, fontWeight: 500, color: "#CC0000", background: "transparent", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                Regenerar lista
              </button>
            </div>
            <button onClick={() => setProtocolUpdatedWarning(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 0, fontSize: 16, lineHeight: 1 }} aria-label="Fechar aviso">×</button>
          </div>
        )}

        {/* Aviso de ciclo de carbo */}
        {hasCycle && (
          <div style={{ background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.25)", borderRadius: 10, padding: "9px 13px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-wheat" style={{ fontSize: 14, color: "#fbbf24", flexShrink: 0 }} aria-hidden="true" />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              Ciclo de carbo aplicado — carboidratos calculados por dia real da semana.
            </p>
          </div>
        )}

        {/* Período + Pessoas */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 5, flex: 1 }}>
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => handleChangePeriod(p.days)}
                style={{ flex: 1, padding: "7px 2px", borderRadius: 20, border: days === p.days ? "1.5px solid #CC0000" : "0.5px solid var(--color-border-secondary)", background: days === p.days ? "rgba(204,0,0,0.1)" : "var(--color-background-primary)", color: days === p.days ? "#CC0000" : "var(--color-text-secondary)", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Multiplicador de pessoas */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 20, padding: "4px 10px" }}>
            <Users size={12} color="var(--color-text-tertiary)" />
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setPersons(n)}
                style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: persons === n ? "#CC0000" : "transparent", color: persons === n ? "#fff" : "var(--color-text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Barra de progresso */}
        {totalItems > 0 && (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                {struckCount === totalItems ? "Tudo no carrinho! 🎉" : `${visibleCount} ${visibleCount === 1 ? "item" : "itens"} restantes`}
                {haveAtHomeCount > 0 && ` · ${haveAtHomeCount} já em casa`}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{struckCount}/{totalItems}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-background-secondary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: progressPct === 100 ? "#34d399" : "#CC0000", borderRadius: 3, transition: "width 0.3s ease, background 0.3s ease" }} />
            </div>
          </div>
        )}

        {/* Toggle de visualização */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button
            onClick={() => setViewMode("macro")}
            style={{ flex: 1, padding: "7px", borderRadius: 8, border: viewMode === "macro" ? "1.5px solid #CC0000" : "0.5px solid var(--color-border-secondary)", background: viewMode === "macro" ? "rgba(204,0,0,0.08)" : "var(--color-background-primary)", color: viewMode === "macro" ? "#CC0000" : "var(--color-text-secondary)", fontSize: 11, fontWeight: 500, cursor: "pointer" }}
          >
            Por nutriente
          </button>
          <button
            onClick={() => setViewMode("sector")}
            style={{ flex: 1, padding: "7px", borderRadius: 8, border: viewMode === "sector" ? "1.5px solid #CC0000" : "0.5px solid var(--color-border-secondary)", background: viewMode === "sector" ? "rgba(204,0,0,0.08)" : "var(--color-background-primary)", color: viewMode === "sector" ? "#CC0000" : "var(--color-text-secondary)", fontSize: 11, fontWeight: 500, cursor: "pointer" }}
          >
            Por setor do mercado
          </button>
        </div>

        {/* Grupos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {viewMode === "macro" ? (
            kindsWithItems.map((kind) => {
              const cfg = KIND_CFG[kind];
              const kindItems = grouped[kind];
              const kindVisible = kindItems.filter((it) => !struck[`${it.kind}:${it.name}`]);
              return (
                <div key={kind} style={{ borderRadius: 12, border: `0.5px solid ${cfg.border}`, background: cfg.bg, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
                    <i className={`ti ${cfg.iconClass}`} style={{ fontSize: 16, color: cfg.color }} aria-hidden="true" />
                    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.09em", textTransform: "uppercase", color: cfg.color, flex: 1 }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: cfg.color, opacity: 0.7 }}>{kindVisible.length}/{kindItems.length}</span>
                  </div>
                  <div style={{ borderTop: `0.5px solid ${cfg.border}` }}>
                    {kindItems.map((it) => renderItemRow(it, cfg.border, cfg.color))}
                  </div>
                </div>
              );
            })
          ) : (
            sectorsWithItems.map((sector) => {
              const cfg = SECTOR_CFG[sector];
              const sectorItems = groupedBySector[sector];
              const sectorVisible = sectorItems.filter((it) => !struck[`${it.kind}:${it.name}`]);
              return (
                <div key={sector} style={{ borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
                    <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--color-text-secondary)", flex: 1 }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{sectorVisible.length}/{sectorItems.length}</span>
                  </div>
                  <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    {sectorItems.map((it) => {
                      const kindCfg = KIND_CFG[kindFromStr(it.kind)];
                      return renderItemRow(it, "var(--color-border-tertiary)", kindCfg.color);
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Já no carrinho (colapsável) */}
        {struckCount > 0 && (
          <div style={{ marginTop: 12, borderRadius: 12, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", overflow: "hidden" }}>
            <button onClick={() => setCartCollapsed((c) => !c)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>Já no carrinho ({struckCount})</span>
              {cartCollapsed ? <ChevronDown size={15} color="var(--color-text-tertiary)" /> : <ChevronUp size={15} color="var(--color-text-tertiary)" />}
            </button>
            {!cartCollapsed && (
              <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                {items.filter((it) => struck[`${it.kind}:${it.name}`]).map((it) => {
                  const key = `${it.kind}:${it.name}`;
                  return (
                    <button key={key} onClick={() => toggleStruck(key)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 14px", background: "transparent", border: "none", borderBottom: "0.5px solid var(--color-border-tertiary)", cursor: "pointer", opacity: 0.5 }}>
                      <span style={{ fontSize: 13, color: "var(--color-text-tertiary)", textDecoration: "line-through", flex: 1, textAlign: "left" }}>{it.name}</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", textDecoration: "line-through" }}>{formatQty(it.total, it.unit)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
          Quantidades em peso cru · Itens riscados não aparecem no envio.
        </p>

        {/* Exportação */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <button onClick={exportPDF} disabled={visibleCount === 0} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 10, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: visibleCount > 0 ? "var(--color-text-primary)" : "var(--color-text-tertiary)", fontSize: 13, fontWeight: 500, cursor: visibleCount > 0 ? "pointer" : "not-allowed", opacity: visibleCount === 0 ? 0.5 : 1 }}>
            <FileDown size={16} /> PDF
          </button>
          <button onClick={shareWhatsApp} disabled={visibleCount === 0} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", borderRadius: 10, border: "none", background: visibleCount > 0 ? "#25D366" : "var(--color-background-secondary)", color: visibleCount > 0 ? "#fff" : "var(--color-text-tertiary)", fontSize: 13, fontWeight: 500, cursor: visibleCount > 0 ? "pointer" : "not-allowed", opacity: visibleCount === 0 ? 0.5 : 1 }}>
            <Share2 size={16} /> WhatsApp
          </button>
        </div>

        {/* Concluir */}
        <button
          onClick={handleComplete}
          style={{ width: "100%", marginTop: 10, padding: "13px", borderRadius: 10, border: "none", background: struckCount === totalItems && totalItems > 0 ? "#34d399" : "rgba(52,211,153,0.12)", color: struckCount === totalItems && totalItems > 0 ? "#fff" : "#34d399", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
        >
          <CheckCircle2 size={16} />
          Concluir compras da semana
        </button>

        {struckCount > 0 && (
          <button onClick={() => setStruck({})} style={{ width: "100%", marginTop: 8, padding: "10px", borderRadius: 10, border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--color-text-tertiary)", fontSize: 12, cursor: "pointer" }}>
            Restaurar {struckCount} {struckCount === 1 ? "item riscado" : "itens riscados"}
          </button>
        )}
      </div>
    </div>
  );
}
