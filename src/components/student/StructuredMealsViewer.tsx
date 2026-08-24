/**
 * StructuredMealsViewer.tsx
 *
 * MUDANÇAS DESTA VERSÃO:
 * - carbMode e isCooked agora vivem aqui (estado global), não nos MealCards
 * - StickyDietBar centraliza os dois controles numa barra sticky no topo
 * - MealCard não tem mais useState para isCooked nem o toggle local de cru/cozido
 * - NutritionStrategyHeader recalcula iterativamente macros REAIS da dieta considerando
 * se a refeição participa do ciclo e dimensionando resíduos (proteína/gordura) da fonte de carbo.
 */

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Flame, Dna, Wheat, Droplets, Salad, Check } from "lucide-react";
import { type CarbMode } from "@/components/student/CarbCycleSelector";
import StickyDietBar from "@/components/student/StickyDietBar";
import { calcItemMacros } from "@/lib/macroCalc";
import { buildWeekStrip, CARB_LABEL, CARB_COLOR, todayKey, tomorrowKey } from "@/lib/weekCycle";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMealCheckins } from "@/hooks/useMealCheckins";
import { slug } from "@/lib/slug";

// ─── Math engine ──────────────────────────────────────────────────────────────
/** Retorna saudação de acordo com o horário local do dispositivo */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Parse seguro de hora no formato HH:MM. Retorna minutos desde 00:00 ou null. */
function parseTimeMinutes(time: unknown): number | null {
  if (typeof time !== "string") return null;
  const trimmed = time.trim();
  const match = trimmed.match(/^([0-9]{1,2}):([0-9]{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Decide qual refeição deve vir aberta com base no horário local.
 * Regras:
 * - Só confia em meal.time quando estiver no padrão HH:MM.
 * - Não reordena o array: retorna o índice posicional do array original.
 * - Preferência: a refeição futura mais próxima da hora atual. Se todas já
 *   passaram, a última do dia. Se nenhum horário for válido, volta para 0.
 */
function getCurrentMealIndex(meals: any[]): number {
  if (!meals.length) return 0;
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  let bestIndex = 0;
  let bestFutureDiff: number | null = null;
  let bestPastDiff: number | null = null;
  let bestPastIndex = 0;
  let hasAnyValidTime = false;

  meals.forEach((meal, index) => {
    const mealMinutes = parseTimeMinutes(meal?.time);
    if (mealMinutes === null) return;
    hasAnyValidTime = true;

    if (mealMinutes >= currentMinutes) {
      const diff = mealMinutes - currentMinutes;
      if (bestFutureDiff === null || diff < bestFutureDiff) {
        bestFutureDiff = diff;
        bestIndex = index;
      }
    } else {
      const diff = currentMinutes - mealMinutes;
      if (bestPastDiff === null || diff < bestPastDiff) {
        bestPastDiff = diff;
        bestPastIndex = index;
      }
    }
  });

  if (!hasAnyValidTime) return 0;
  return bestFutureDiff !== null ? bestIndex : bestPastIndex;
}


function getCookedMultiplier(name: string): number {
  const s = name.toLowerCase();
  if (/\barroz(?!\s+integral)/.test(s)) return 2.5;
  if (/arroz\s+integral/.test(s)) return 2.4;
  if (/(macarr[aã]o|massa|talharim|espaguete|penne|p[aã]o)/.test(s)) return 2.2;
  if (/(cuscuz|quinoa)/.test(s)) return 2.4;
  if (/aveia/.test(s)) return 2.5;
  if (/feij[aã]o/.test(s)) return 2.3;
  if (/lentilha|gr[aã]o[- ]de[- ]bico/.test(s)) return 2.4;
  if (/(batata\s+doce|batata|mandioca|aipim|inhame|cará)/.test(s)) return 0.85;
  if (/(frango|peito\s+de\s+frango|peru)/.test(s)) return 0.70;
  if (/(patinho|alcatra|coxão|filé\s+mignon|carne\s+vermelha|carne\s+moída|carne\s+bovina|boi|suíno|porco|lombo)/.test(s)) return 0.70;
  if (/(peixe|til[áa]pia|salm[ãa]o|atum|merluza|pescada|bacalhau)/.test(s)) return 0.75;
  if (/(camar[ãa]o|fruto.*mar)/.test(s)) return 0.75;
  if (/(ovo)/.test(s)) return 0.90;
  if (/(coração|fígado|moela)/.test(s)) return 0.70;
  if (/(m[uú]sculo\s+bovino|ac[eé]m|costela|bisteca)/.test(s)) return 0.68;
  if (/(pernil|lombo\s+su[ií]no)/.test(s)) return 0.72;
  if (/(sardinha|mussarela|queijo)/.test(s)) return 1;
  return 1;
}

function applySmartMath(
  text: string,
  mode: CarbMode,
  isCooked: boolean,
  isCarbGroup: boolean,
  foodName = "",
  highPct = 15,
  lowPct = 15,
): string {
  if (!text) return "";
  const carbMult =
    mode === "high"
      ? 1 + highPct / 100
      : mode === "low" || mode === "off"
      ? 1 - lowPct / 100
      : 1;
  const cookedMult = isCooked ? getCookedMultiplier(foodName || text) : 1;
  let out = text.replace(
    /(\d+(?:[.,]\d+)?)(\s*)(g|ml|kg)/gi,
    (_, num, sp, unit) => {
      let v = Number(String(num).replace(",", "."));
      if (isCarbGroup) v *= carbMult;
      v *= cookedMult;
      return `${Math.round(v)}${sp}${unit}`;
    },
  );
  if (isCooked) {
    out = out
      .replace(/\bcru(a)?\b/gi, "cozido")
      .replace(/\b(grelhado|assado)\b/gi, "cozido");
  } else {
    out = out.replace(/\b(pronto|cozido|grelhado|assado)(a)?\b/gi, "cru");
  }
  return out;
}

function stripHtml(str: string): string {
  return (str || "")
    .replace(/<[^>]*>/g, "")
    .replace(/class\s*=\s*["'][^"']*["']/gi, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const COOKABLE_REGEX =
  /(arroz|macarr[aã]o|massa|cuscuz|aveia|mandioca|batata|frango|carne|patinho|peixe|til[áa]pia|salm[ãa]o|boi|su[ií]no|porco)/i;

function mealHasCookable(meal: any): boolean {
  const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
  return opts
    .filter((o: any) => o?.kind === "carb" || o?.kind === "protein")
    .some(
      (o: any) =>
        Array.isArray(o.items) &&
        o.items.some((it: any) =>
          COOKABLE_REGEX.test(stripHtml(it?.baseName || it?.name || "")),
        ),
    );
}

function calculateRealTotals(
  meals: any[],
  carbMode: CarbMode,
  highPct: number,
  lowPct: number
) {
  let totalP = 0;
  let totalC = 0;
  let totalF = 0;

  meals.forEach((meal) => {
    // Isola as refeições que não participam do ciclo
    const effectiveMode = meal.carbCycle === false ? "base" : carbMode;
    const carbMult =
      effectiveMode === "high"
        ? 1 + highPct / 100
        : effectiveMode === "low" || effectiveMode === "off"
        ? 1 - lowPct / 100
        : 1;

    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
    const seenKind: Record<string, boolean> = {};

    opts.forEach((opt) => {
      const kind = opt?.kind || "other";
      // Soma apenas a Opção Principal (Opção 1) no placar
      if (seenKind[kind]) return;
      seenKind[kind] = true;

      const isCarbGroup = kind === "carb";
      const items: any[] = Array.isArray(opt?.items) ? opt.items : [];

      items.forEach((it) => {
        const m = calcItemMacros(it);
        // Aplica o ciclo apenas no grupo carboidrato.
        // Como fisicamente aumenta a porção da aveia/arroz, escala C, P e F do item.
        const mult = isCarbGroup ? carbMult : 1;

        totalP += m.protein * mult;
        totalC += m.carbs * mult;
        totalF += m.fat * mult;
      });
    });
  });

  return {
    protein: Math.round(totalP),
    carbs: Math.round(totalC),
    fat: Math.round(totalF),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const KIND_META = {
  carb:    { label: "CARBOIDRATO",       color: "text-amber-400",   border: "border-amber-500/20",   bg: "bg-amber-500/5"   },
  protein: { label: "PROTEÍNA",          color: "text-blue-400",    border: "border-blue-500/20",    bg: "bg-blue-500/5"    },
  fat:     { label: "GORDURA",           color: "text-rose-400",    border: "border-rose-500/20",    bg: "bg-rose-500/5"    },
  veg:     { label: "LEGUMES E SALADAS", color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
} as const;

type Kind = keyof typeof KIND_META;

const OPTION_LABELS = ["OPÇÃO PRINCIPAL", "OPÇÃO ALTERNATIVA", "OPÇÃO 3", "OPÇÃO 4", "OPÇÃO 5"];

// ─── NutritionStrategyHeader — macros recalculados de forma exata ─────────────
function NutritionStrategyHeader({
  payload,
  carbMode,
  highPct,
  lowPct,
}: {
  payload: any;
  carbMode: CarbMode;
  highPct: number;
  lowPct: number;
}) {
  const meals: any[] = Array.isArray(payload?.meals) ? payload.meals : [];

  // Usa os macros REAIS dos alimentos quando disponíveis; caso contrário,
  // cai para os macros-meta definidos pelo coach (payload.macros).
  const realTotals = calculateRealTotals(meals, carbMode, highPct, lowPct);
  const hasRealData = realTotals.protein > 0 || realTotals.carbs > 0 || realTotals.fat > 0;

  const m = payload?.macros ?? {};
  const carbMult =
    carbMode === "high"
      ? 1 + highPct / 100
      : carbMode === "low" || carbMode === "off"
      ? 1 - lowPct / 100
      : 1;

  const baseCarbs   = Number(m.carbs   ?? 0);
  const baseFat     = Number(m.fat     ?? 0);
  const baseProtein = Number(m.protein ?? 0);
  const adjCarbs    = Math.round(baseCarbs * carbMult);

  // Prioriza totais reais dos alimentos TACO/industriais;
  // usa metas do coach como fallback quando não há dados TACO.
  const dispProtein = hasRealData ? realTotals.protein : baseProtein;
  const dispCarbs   = hasRealData ? realTotals.carbs   : adjCarbs;
  const dispFat     = hasRealData ? realTotals.fat     : baseFat;

  const adjCalories = dispProtein > 0 || dispCarbs > 0 || dispFat > 0
    ? Math.round(dispProtein * 4 + dispCarbs * 4 + dispFat * 9)
    : 0;

  const macros = [
    { icon: Flame,    value: adjCalories || "—", unit: "kcal", label: "Energia"  },
    { icon: Dna,      value: dispProtein || "—", unit: "g",   label: "Proteína" },
    { icon: Wheat,    value: dispCarbs   || "—", unit: "g",   label: "Carbo"    },
    { icon: Droplets, value: dispFat     || "—", unit: "g",   label: "Gordura"  },
  ];

  const modeLabel = carbMode === "high" ? "↑ Carboidrato Alto"
    : carbMode === "low" || carbMode === "off" ? "↓ Carboidrato Baixo"
    : null;

  return (
    <div className="glass-strong rounded-2xl overflow-hidden glow-primary mb-4">
      <div className="gradient-primary-soft px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-bold">
          Estratégia Nutricional
        </p>
        {modeLabel && (
          <span className="text-[10px] font-bold text-amber-400">{modeLabel}</span>
        )}
      </div>
      <div className="grid grid-cols-4 divide-x divide-white/5">
        {macros.map(({ icon: Icon, value, unit, label }) => (
          <div key={label} className="flex flex-col items-center py-4 px-2 min-w-0">
            <Icon className="w-3.5 h-3.5 text-primary/60 mb-1.5" />
            <span className="text-xl font-black text-foreground leading-none">{value}</span>
            <span className="text-[10px] text-primary font-bold mt-0.5">{unit}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function humanizeUnit(weight: string): string {
  if (!weight) return "";
  return weight
    .replace(/\b(uni|un)\b/gi, "unidade(s)")
    .replace(/\bml\b/gi, "ml (mililitros)")
    .replace(/\bmg\b/gi, "mg (miligramas)")
    .replace(/\bkg\b/gi, "kg (quilogramas)")
    .replace(/\bg\b/gi, "g (gramas)");
}

// ─── MacroSection ─────────────────────────────────────────────────────────────
function MacroSection({
  kind, opts, mode, isCooked, highPct, lowPct, mealName,
}: {
  kind: Kind; opts: any[]; mode: CarbMode; isCooked: boolean; highPct: number; lowPct: number; mealName: string;
}) {
  const cfg = KIND_META[kind];
  const isCarb = kind === "carb";
  const [showAlternatives, setShowAlternatives] = useState(false);

  const filledOpts = opts.filter(
    (o: any) =>
      Array.isArray(o.items) &&
      o.items.some((it: any) => stripHtml(it?.baseName || it?.name || "")),
  );
  if (!filledOpts.length) return null;

  const hasAlternatives = filledOpts.length > 1;
  // A macro no topo da tela sempre soma a primeira opção — então é ela que
  // fica em destaque por padrão. As demais são substituições, não itens
  // extras: ficam escondidas atrás de um toque explícito, em vez de
  // empilhadas junto da opção principal.
  const visibleOpts = showAlternatives ? filledOpts : filledOpts.slice(0, 1);

  const renderItems = (opt: any) => {
    const items = (opt.items as any[])
      .map((it: any) => {
        const name = stripHtml(it?.baseName || it?.name || "");
        if (!name) return null;
        // CORREÇÃO: prioriza o weight textual do coach (preserva 'unidades', 'fatias', etc.).
        // rawWeight (gramas internas TACO) é usado apenas quando weight está vazio ou é só número.
        const resolveWeight = (src: any) => {
          const weightStr = stripHtml(src?.weight || "");
          const hasUnitWord = /un|unid|fatia|ovo|colher|copo|porc/i.test(weightStr);
          const rawText = hasUnitWord
            ? weightStr
            : (src?.rawWeight ? `${src.rawWeight}g` : weightStr);
          return rawText
            ? applySmartMath(rawText, mode, isCooked, isCarb, name, highPct, lowPct)
            : "";
        };
        const sub = it?.substitution;
        const subName = stripHtml(sub?.baseName || sub?.name || "");
        return {
          name,
          weight: resolveWeight(it),
          sub: subName ? { name: subName, weight: resolveWeight(sub) } : null,
        };
      })
      .filter(Boolean) as { name: string; weight: string; sub: { name: string; weight: string } | null }[];
    return items;
  };


  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3`}>
      <p className={`text-[10px] uppercase tracking-[0.18em] font-black mb-3 ${cfg.color} flex items-center gap-1.5`}>
        {kind === "veg" && <Salad className="w-3 h-3" />}
        {cfg.label}
      </p>

      <div className="space-y-3">
        {visibleOpts.map((opt: any, i: number) => {
          const optIdx = filledOpts.indexOf(opt);
          const items = renderItems(opt);
          if (!items.length) return null;

          const optTitle = String(opt?.title || `Opção ${optIdx + 1}`);
          const anchorBase = `meal-${slug(mealName)}-${kind}-${slug(optTitle)}`;
          return (
            <div key={optIdx} className={i > 0 ? "pt-3 border-t border-white/5" : ""}>
              {hasAlternatives && (
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-bold mb-1.5">
                  {OPTION_LABELS[optIdx] ?? `OPÇÃO ${optIdx + 1}`}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item, ii) => (
                  <li key={ii} id={`${anchorBase}-item-${slug(item.name)}`}>
                    <div className="flex items-baseline justify-between gap-3 px-1">
                      <span className="text-sm leading-snug text-foreground/90 break-words min-w-0 flex-1">
                        {item.name}
                      </span>
                      {item.weight && (
                        <span className={`text-xs tabular-nums shrink-0 font-bold ${cfg.color}`}>
                          {humanizeUnit(item.weight)}
                        </span>
                      )}
                    </div>
                    {item.sub && (
                      <div className="mt-1 ml-4 pl-2.5 border-l-2 border-dashed border-amber-500/40 flex items-baseline justify-between gap-3">
                        <span className="text-[11px] leading-snug text-muted-foreground break-words min-w-0 flex-1">
                          <span className="text-amber-500 font-bold">↳ 🔁 Substituição opcional: </span>
                          {item.sub.name}
                        </span>
                        {item.sub.weight && (
                          <span className="text-[11px] tabular-nums shrink-0 font-bold text-amber-500">
                            {humanizeUnit(item.sub.weight)}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {opt.notes?.trim() && (
                <p className="text-[11px] text-muted-foreground italic mt-1.5 pl-1">
                  {stripHtml(opt.notes)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {hasAlternatives && (
        <button
          type="button"
          onClick={() => setShowAlternatives((v) => !v)}
          className={`mt-3 text-[11px] font-bold ${cfg.color} opacity-80 hover:opacity-100 transition-opacity`}
        >
          {showAlternatives
            ? "Ocultar outras opções"
            : `Trocar por outra opção (${filledOpts.length - 1})`}
        </button>
      )}
    </div>
  );
}

// ─── MealCard — sem estado local de isCooked, recebe via props ────────────────
const MEAL_ICONS = ["☀️", "🥗", "💪", "🍽️", "🌙", "⚡", "🥤", "🌿"];

function MealCard({
  meal, index, mode, isCooked, highPct, lowPct, supplements, isChecked, onToggleChecked, isCurrent,
}: {
  meal: any;
  index: number;
  mode: CarbMode;
  isCooked: boolean;
  highPct: number;
  lowPct: number;
  supplements?: any[];
  isChecked?: boolean;
  onToggleChecked?: (index: number) => void;
  isCurrent?: boolean;
}) {
  const [open, setOpen] = useState(isCurrent ?? index === 0);


  const allOptions: any[] = Array.isArray(meal.options) ? meal.options : [];
  const hiddenKinds: string[] = Array.isArray(meal.hiddenKinds) ? meal.hiddenKinds : [];
  const isHidden = (k: string) => hiddenKinds.includes(k);
  const mealName = meal.name || `Refeição ${index + 1}`;
  const linkedSupps = (supplements || []).filter(
    (s: any) => s?.mealRef && s.mealRef === mealName,
  );

  const carbOpts    = allOptions.filter((o: any) => o?.kind === "carb");
  const proteinOpts = allOptions.filter((o: any) => o?.kind === "protein");
  const fatOpts     = allOptions.filter((o: any) => o?.kind === "fat");
  const vegOpts     = allOptions.filter(
    (o: any) => o?.kind === "veg" || o?.kind === "vegetable" || o?.kind === "salad",
  );

  // Se a refeição individual não participa do ciclo de carbo, força "base"
  const effectiveMode: CarbMode = meal.carbCycle === false ? "base" : mode;
  const icon = MEAL_ICONS[index % MEAL_ICONS.length];

  return (
    <div className="glass rounded-2xl overflow-hidden card-hover border border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {onToggleChecked && (
            <motion.button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleChecked(index); }}
              whileTap={{ scale: 0.85 }}
              animate={isChecked ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.25 }}
              aria-pressed={!!isChecked}
              aria-label={isChecked ? "Marcar como não feita" : "Marcar refeição como feita"}
              className={cn(
                "w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                isChecked
                  ? "bg-emerald-500 border-emerald-500 text-black"
                  : "border-white/20 text-white/40 hover:border-emerald-500/60",
              )}
            >
              {isChecked ? <Check className="w-4 h-4" strokeWidth={3} /> : null}
            </motion.button>
          )}
          <span className="text-xl leading-none shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-sm leading-tight truncate">
              {meal.name || `Refeição ${index + 1}`}
            </p>
            {meal.time && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {meal.time}
              </p>
            )}
          </div>
        </div>
        <span
          className={`text-muted-foreground transition-transform duration-200 text-xs shrink-0 ml-2 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-white/5 pt-3">
          {!isHidden("carb") && (
            <MacroSection kind="carb" opts={carbOpts} mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} mealName={mealName} />
          )}
          {!isHidden("protein") && (
            <MacroSection kind="protein" opts={proteinOpts} mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} mealName={mealName} />
          )}
          {!isHidden("fat") && (
            <MacroSection kind="fat" opts={fatOpts} mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} mealName={mealName} />
          )}
          <MacroSection kind="veg" opts={vegOpts} mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} mealName={mealName} />

          {linkedSupps.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-primary">
                Suplementos desta refeição
              </p>
              {linkedSupps.map((s: any, i: number) => (
                <p key={i} className="text-xs text-foreground/90">
                  <span className="font-semibold">{s.name}</span>
                  {s.dose ? ` · ${s.dose}` : ""}
                  {s.notes ? (
                    <span className="text-muted-foreground"> — {s.notes}</span>
                  ) : null}
                </p>
              ))}
            </div>
          )}

          {meal.notes && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
                Observação
              </p>
              <p className="text-xs text-foreground/90 break-words whitespace-pre-wrap">
                {stripHtml(meal.notes)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function StructuredMealsViewer({ payload, studentName }: { payload: any; studentName?: string }) {
  const safeData = payload || {};
  const meals: any[] = Array.isArray(safeData.meals) ? safeData.meals : [];

  // Sessão do aluno para gravar meal_checkins do dia.
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUid(data.session?.user?.id ?? null));
  }, []);
  const dayKey = new Date().toISOString().slice(0, 10);
  const { checked, toggle, doneCount, progressPct } = useMealCheckins(uid, dayKey, meals.length);

  // ── Contexto do dia ─────────────────────────────────────────────────────
  const strip = buildWeekStrip(safeData);
  const todayInfo = strip.find((d) => d.isToday)!;
  const tomorrowInfo = strip.find((d) => d.key === tomorrowKey())!;
  const workouts: any[] = Array.isArray(safeData.workouts) ? safeData.workouts : [];
  const findWorkout = (k: string) => workouts.find((w) => w.key === k);
  const todayWorkout = todayInfo.workoutKey ? findWorkout(todayInfo.workoutKey) : null;
  const tomorrowWorkout = tomorrowInfo.workoutKey ? findWorkout(tomorrowInfo.workoutKey) : null;

  // ── Estado global — único para todas as refeições ──
  const [carbMode, setCarbMode] = useState<CarbMode>(todayInfo.carb as CarbMode);
  const [isCooked, setIsCooked] = useState(false);

  const highPct: number = safeData.carbCycleHighPct ?? 15;
  const lowPct: number  = safeData.carbCycleLowPct  ?? 15;

  const hasCarbCycle =
    safeData?.setup?.carbCycle === true || safeData?.carbCycle === true;

  // Verifica se ALGUMA refeição tem alimento cozinhável (calcula uma vez)
  const hasCookable = useMemo(
    () => meals.some(mealHasCookable),
    [meals],
  );

  // Índice da refeição que deve vir aberta por padrão (baseado no horário local).
  // NÃO reordena o array — mantém a referência posicional usada por meal_checkins.
  const currentMealIndex = useMemo(
    () => getCurrentMealIndex(meals),
    [meals],
  );

  if (meals.length === 0) return null;


  const carbCfg = CARB_COLOR[todayInfo.carb];
  const carbCfgT = CARB_COLOR[tomorrowInfo.carb];

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      {/* ── Card de contexto do dia — saudação + carbo + treino ── */}
      <div className={cn(
        "rounded-2xl border p-4 mb-3 flex flex-col gap-2",
        carbCfg.border, carbCfg.bg
      )}>
        {/* Linha 1 — Saudação */}
        <p className="text-sm font-semibold text-foreground leading-tight">
          {getGreeting()}{studentName ? `, ${studentName}` : ""}! 👋
        </p>

        {/* Linha 2 — Tipo de carbo do dia */}
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className={cn("text-[10px] uppercase tracking-[0.2em] font-bold", carbCfg.text)}>
              Hoje · Carbo
            </p>
            <p className={cn("text-3xl font-black leading-none mt-0.5", carbCfg.text)}>
              {CARB_LABEL[todayInfo.carb]}
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {todayInfo.label}
          </span>
        </div>

        {/* Linha 3 — Treino ou mensagem de descanso */}
        {todayWorkout ? (
          <p className="text-[12px] text-muted-foreground">
            Dia de treino{" "}
            <span className="text-foreground font-semibold">{todayWorkout.key}</span>
            {todayWorkout.focus ? <> · {todayWorkout.focus}</> : null}
            {" "}— foco total na execução 💪
          </p>
        ) : (
          <p className="text-[12px] text-muted-foreground italic">
            Dia de descanso — recuperação é parte do processo. Hidrate-se bem e durma cedo 🌙
          </p>
        )}
      </div>

      {/* ── Week strip (read-only) ── */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {strip.map((d) => {
          const cc = CARB_COLOR[d.carb];
          return (
            <div
              key={d.key}
              className={cn(
                "rounded-lg border bg-background/50 px-1 py-1 flex flex-col items-center gap-0.5",
                d.isToday ? "border-[#CC0000]" : "border-border/40"
              )}
            >
              <span className="text-[9px] uppercase text-muted-foreground tracking-wider">{d.abbr}</span>
              <span className="text-[12px] font-bold text-foreground leading-none">{d.workoutKey || "—"}</span>
              <span className={cn("text-[8px] font-bold uppercase px-1 py-px rounded border leading-none mt-0.5", cc.pill)}>
                {CARB_LABEL[d.carb]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Macros — estático, não precisa de sticky */}
      <NutritionStrategyHeader
        payload={safeData}
        carbMode={carbMode}
        highPct={highPct}
        lowPct={lowPct}
      />

      {/* Barra sticky com os dois controles */}
      <StickyDietBar
        carbMode={carbMode}
        onCarbChange={setCarbMode}
        isCooked={isCooked}
        onCookedChange={setIsCooked}
        hasCarbCycle={hasCarbCycle}
        hasCookable={hasCookable}
        totalMeals={meals.length}
        doneCount={doneCount}
        progressPct={progressPct}
        checked={checked}
      />

      {/* Grid de refeições */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
        {meals.map((meal: any, i: number) => (
          <MealCard
            key={i}
            meal={meal}
            index={i}
            mode={carbMode}
            isCooked={isCooked}
            highPct={highPct}
            lowPct={lowPct}
            supplements={safeData.supplements}
            isChecked={!!checked[i]}
            onToggleChecked={uid ? toggle : undefined}
            isCurrent={i === currentMealIndex}
          />
        ))}
      </div>

      {/* ── Preview de amanhã ── */}
      <div className={cn(
        "mt-4 rounded-xl border px-4 py-3 flex flex-col gap-1",
        carbCfgT.border, carbCfgT.bg
      )}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
          Amanhã — prepare-se
        </p>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-foreground/90">
            {tomorrowWorkout ? (
              <>
                Treino{" "}
                <span className="font-bold">{tomorrowWorkout.key}</span>
                {tomorrowWorkout.focus ? <> · {tomorrowWorkout.focus}</> : null}
              </>
            ) : (
              <span className="italic text-muted-foreground">Descanso</span>
            )}
          </p>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border shrink-0",
            carbCfgT.pill
          )}>
            Carbo {CARB_LABEL[tomorrowInfo.carb]}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {tomorrowWorkout
            ? "Organize suas refeições com antecedência para garantir energia no treino."
            : "Aproveite para descansar e repor as energias para os próximos dias."}
        </p>
      </div>
    </div>
  );
}
