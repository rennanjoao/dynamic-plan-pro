import { useState } from "react";
import { Clock, TrendingUp, TrendingDown, Minus, Scale, Flame, Dna, Wheat, Droplets, Salad } from "lucide-react";
import { type CarbMode } from "@/components/student/CarbCycleSelector";

// ─── Math engine ──────────────────────────────────────────────────────────────
// Conversão real cru → cozido (multiplicadores baseados em tabela TACO/USDA)
// Aplicado quando o coach cadastra o valor em CRU e o aluno escolhe ver em COZIDO.
function getCookedMultiplier(name: string): number {
  const s = name.toLowerCase();
  // Carboidratos que absorvem água
  if (/\barroz(?!\s+integral)/.test(s)) return 2.5;      // arroz branco
  if (/arroz\s+integral/.test(s)) return 2.4;
  if (/(macarr[aã]o|massa|talharim|espaguete|penne|p[aã]o)/.test(s)) return 2.2;
  if (/(cuscuz|quinoa)/.test(s)) return 2.4;
  if (/aveia/.test(s)) return 2.5;
  if (/feij[aã]o/.test(s)) return 2.3;
  if (/lentilha|gr[aã]o[- ]de[- ]bico/.test(s)) return 2.4;
  // Tubérculos perdem água
  if (/(batata\s+doce|batata|mandioca|aipim|inhame|cará)/.test(s)) return 0.85;
  // Proteínas perdem água ao cozinhar
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

function applySmartMath(text: string, mode: CarbMode, isCooked: boolean, isCarbGroup: boolean, foodName = "", highPct = 15, lowPct = 15): string {
  if (!text) return "";
  const carbMult = mode === "high" ? 1 + highPct / 100 : (mode === "low" || mode === "off") ? 1 - lowPct / 100 : 1;
  const cookedMult = isCooked ? getCookedMultiplier(foodName || text) : 1;
  let out = text.replace(/(\d+(?:[.,]\d+)?)(\s*)(g|ml|kg)/gi, (_, num, sp, unit) => {
    let v = Number(String(num).replace(",", "."));
    if (isCarbGroup) v *= carbMult;
    v *= cookedMult;
    return `${Math.round(v)}${sp}${unit}`;
  });
  if (isCooked) {
    out = out.replace(/\bcru(a)?\b/gi, "cozido").replace(/\b(grelhado|assado)\b/gi, "cozido");
  } else {
    out = out.replace(/\b(pronto|cozido|grelhado|assado)(a)?\b/gi, "cru");
  }
  return out;
}

// Strip any HTML tags / class names that may have been injected into saved data
function stripHtml(str: string): string {
  return (str || "")
    .replace(/<[^>]*>/g, "")
    .replace(/class\s*=\s*["'][^"']*["']/gi, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ─── Constants ────────────────────────────────────────────────────────────────
const KIND_META = {
  carb:    { label: "CARBOIDRATO", color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5" },
  protein: { label: "PROTEÍNA",    color: "text-blue-400",  border: "border-blue-500/20",  bg: "bg-blue-500/5"  },
  fat:     { label: "GORDURA",     color: "text-rose-400",  border: "border-rose-500/20",  bg: "bg-rose-500/5"  },
  veg:     { label: "LEGUMES E SALADAS", color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
} as const;

type Kind = keyof typeof KIND_META;

const OPTION_LABELS = ["OPÇÃO PRINCIPAL", "OPÇÃO ALTERNATIVA", "OPÇÃO 3", "OPÇÃO 4", "OPÇÃO 5"];

// ─── NutritionStrategyHeader (sem CRU/COZIDO global) ──────────────────────────
function NutritionStrategyHeader({
  payload, mode, setMode,
}: {
  payload: any; mode: CarbMode; setMode: (m: CarbMode) => void;
}) {
  const m = payload?.macros ?? {};
  const hasCarbCycle = payload?.setup?.carbCycle === true || payload?.carbCycle === true;
  const highPct = payload?.carbCycleHighPct ?? 15;
  const lowPct  = payload?.carbCycleLowPct  ?? 15;
  const macros = [
    { icon: Flame,    value: m.calories ?? "—", unit: "kcal", label: "Energia"  },
    { icon: Dna,      value: m.protein  ?? "—", unit: "g",    label: "Proteína" },
    { icon: Wheat,    value: m.carbs    ?? "—", unit: "g",    label: "Carbo"    },
    { icon: Droplets, value: m.fat      ?? "—", unit: "g",    label: "Gordura"  },
  ];
  return (
    <div className="glass-strong rounded-2xl overflow-hidden glow-primary mb-6">
      <div className="gradient-primary-soft px-5 py-3 border-b border-white/5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-bold">Estratégia Nutricional</p>
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
      {hasCarbCycle && (
        <div className="px-4 pb-4 pt-3">
          <div className="flex gap-2">
            {([
              { id: "base" as CarbMode, label: "DIA BASE",          Icon: Minus,        cls: "data-[on=true]:bg-blue-500/20  data-[on=true]:border-blue-500/40  data-[on=true]:text-blue-300"     },
              { id: "high" as CarbMode, label: `ALTO +${highPct}%`, Icon: TrendingUp,   cls: "data-[on=true]:bg-emerald-500/20 data-[on=true]:border-emerald-500/40 data-[on=true]:text-emerald-300" },
              { id: "off"  as CarbMode, label: `OFF −${lowPct}%`,   Icon: TrendingDown, cls: "data-[on=true]:bg-amber-500/20  data-[on=true]:border-amber-500/40  data-[on=true]:text-amber-300"   },
            ] as const).map(({ id, label, Icon, cls }) => (
              <button key={id} type="button" data-on={mode === id} onClick={() => setMode(id)}
                className={`flex-1 h-9 rounded-xl text-[10px] font-bold border border-white/10 glass flex items-center justify-center gap-1 transition-all ${cls}`}>
                <Icon className="w-3 h-3" />{label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MacroSection: each option rendered as its own sub-block ─────────────────
function MacroSection({
  kind, opts, mode, isCooked, highPct, lowPct,
}: {
  kind: Kind; opts: any[]; mode: CarbMode; isCooked: boolean; highPct: number; lowPct: number;
}) {
  const cfg = KIND_META[kind];
  const isCarb = kind === "carb";

  const filledOpts = opts.filter((o: any) =>
    Array.isArray(o.items) && o.items.some((it: any) => stripHtml(it?.baseName || it?.name || ""))
  );
  if (!filledOpts.length) return null;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3`}>
      <p className={`text-[10px] uppercase tracking-[0.18em] font-black mb-3 ${cfg.color} flex items-center gap-1.5`}>
        {kind === "veg" && <Salad className="w-3 h-3" />}
        {kind === "veg" ? cfg.label : `ESCOLHA UMA ${cfg.label}`}
      </p>

      <div className="space-y-3">
        {filledOpts.map((opt: any, optIdx: number) => {
          const items = (opt.items as any[])
            .map((it: any) => {
              const name = stripHtml(it?.baseName || it?.name || "");
              if (!name) return null;
              const rawText = it.rawWeight ? `${it.rawWeight}g` : stripHtml(it.weight || "");
              const weight = rawText ? applySmartMath(rawText, mode, isCooked, isCarb, name, highPct, lowPct) : "";
              return { name, weight };
            })
            .filter(Boolean) as { name: string; weight: string }[];
          if (!items.length) return null;

          const showLabel = filledOpts.length > 1;
          return (
            <div key={optIdx} className={optIdx > 0 ? "pt-3 border-t border-white/5" : ""}>
              {showLabel && (
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground font-bold mb-1.5">
                  {OPTION_LABELS[optIdx] ?? `OPÇÃO ${optIdx + 1}`}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 px-1">
                    <span className="text-sm leading-snug text-foreground/90 break-words min-w-0 flex-1">
                      {item.name}
                    </span>
                    {item.weight && (
                      <span className={`text-xs tabular-nums shrink-0 font-bold ${cfg.color}`}>
                        {item.weight}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {opt.notes?.trim() && (
                <p className="text-[11px] text-muted-foreground italic mt-1.5 pl-1">{stripHtml(opt.notes)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MealCard ─────────────────────────────────────────────────────────────────
const MEAL_ICONS = ["☀️", "🥗", "💪", "🍽️", "🌙", "⚡", "🥤", "🌿"];

function MealCard({ meal, index, mode, highPct, lowPct, supplements }: {
  meal: any; index: number; mode: CarbMode; highPct: number; lowPct: number; supplements?: any[];
}) {
  const [open, setOpen] = useState(index === 0);
  const [isCooked, setIsCooked] = useState(false);
  const allOptions: any[] = Array.isArray(meal.options) ? meal.options : [];
  const hiddenKinds: string[] = Array.isArray(meal.hiddenKinds) ? meal.hiddenKinds : [];
  const isHidden = (k: string) => hiddenKinds.includes(k);
  const mealName = meal.name || `Refeição ${index + 1}`;
  const linkedSupps = (supplements || []).filter((s: any) => s?.mealRef && s.mealRef === mealName);

  // Strict per-kind grouping — never mix
  const carbOpts    = allOptions.filter((o: any) => o?.kind === "carb");
  const proteinOpts = allOptions.filter((o: any) => o?.kind === "protein");
  const fatOpts     = allOptions.filter((o: any) => o?.kind === "fat");
  const vegOpts     = allOptions.filter((o: any) => o?.kind === "veg" || o?.kind === "vegetable" || o?.kind === "salad");

  const effectiveMode: CarbMode = meal.carbCycle === false ? "base" : mode;
  const icon = MEAL_ICONS[index % MEAL_ICONS.length];

  // Show cru/cozido toggle only if there's any cookable content
  const hasCookable = [...carbOpts, ...proteinOpts].some((o: any) =>
    Array.isArray(o.items) && o.items.some((it: any) =>
      /(arroz|macarrão|massa|cuscuz|aveia|mandioca|batata|frango|carne|patinho|peixe|tilápia|salmão|boi|suíno|porco)/i
        .test(stripHtml(it?.baseName || it?.name || ""))
    )
  );

  return (
    <div className="glass rounded-2xl overflow-hidden card-hover border border-white/[0.06]">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl leading-none shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-sm leading-tight truncate">{meal.name || `Refeição ${index + 1}`}</p>
            {meal.time && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />{meal.time}
              </p>
            )}
          </div>
        </div>
        <span className={`text-muted-foreground transition-transform duration-200 text-xs shrink-0 ml-2 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-white/5 pt-3">
          {hasCookable && (
            <div className="flex gap-2">
              {[false, true].map((cooked) => (
                <button key={String(cooked)} type="button" onClick={() => setIsCooked(cooked)}
                  className={`flex-1 h-8 rounded-lg text-[11px] font-bold border transition-all ${isCooked === cooked ? "gradient-primary text-white border-primary/40" : "glass border-white/10 text-muted-foreground hover:border-white/20"}`}>
                  <Scale className="w-3 h-3 inline mr-1 opacity-70" />
                  {cooked ? "COZIDO" : "CRU"}
                </button>
              ))}
            </div>
          )}

          {!isHidden("carb")    && <MacroSection kind="carb"    opts={carbOpts}    mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} />}
          {!isHidden("protein") && <MacroSection kind="protein" opts={proteinOpts} mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} />}
          {!isHidden("fat")     && <MacroSection kind="fat"     opts={fatOpts}     mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} />}
          <MacroSection kind="veg"     opts={vegOpts}     mode={effectiveMode} isCooked={isCooked} highPct={highPct} lowPct={lowPct} />

          {linkedSupps.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-primary">Suplementos desta refeição</p>
              {linkedSupps.map((s: any, i: number) => (
                <p key={i} className="text-xs text-foreground/90">
                  <span className="font-semibold">{s.name}</span>
                  {s.dose ? ` · ${s.dose}` : ""}
                  {s.notes ? <span className="text-muted-foreground"> — {s.notes}</span> : ""}
                </p>
              ))}
            </div>
          )}




          {meal.notes && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Observação</p>
              <p className="text-xs text-foreground/90 break-words whitespace-pre-wrap">{stripHtml(meal.notes)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function StructuredMealsViewer({ payload }: { payload: any }) {
  const safeData = payload || {};
  const meals: any[] = Array.isArray(safeData.meals) ? safeData.meals : [];
  const [mode, setMode] = useState<CarbMode>("base");
  const highPct: number = safeData.carbCycleHighPct ?? 15;
  const lowPct: number  = safeData.carbCycleLowPct  ?? 15;

  if (meals.length === 0) return null;

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <NutritionStrategyHeader payload={safeData} mode={mode} setMode={setMode} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {meals.map((meal: any, i: number) => (
          <MealCard key={i} meal={meal} index={i} mode={mode} highPct={highPct} lowPct={lowPct} supplements={safeData.supplements} />
        ))}
      </div>
    </div>
  );
}
