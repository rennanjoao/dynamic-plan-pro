/**
 * StickyDietBar.tsx
 *
 * Barra sticky global da aba de dieta.
 * Fica colada no topo enquanto o aluno rola a tela.
 *
 * Controles:
 *  - Ciclo de carbo: [ Carbo Alto | Base | Carbo Baixo ]  (só aparece se o coach ativou carbCycle)
 *  - Cru / Cozido: toggle compacto ao lado
 *
 * O estado vive no StructuredMealsViewer (pai) e desce via props.
 * Os MealCards não guardam mais estado local de isCooked.
 */

import { TrendingUp, TrendingDown, Minus, Scale } from "lucide-react";
import { type CarbMode } from "@/components/student/CarbCycleSelector";

interface StickyDietBarProps {
  carbMode: CarbMode;
  onCarbChange: (m: CarbMode) => void;
  isCooked: boolean;
  onCookedChange: (v: boolean) => void;
  hasCarbCycle: boolean;
  hasCookable: boolean;
}

const CARB_OPTIONS = [
  {
    id: "high" as CarbMode,
    label: "Carbo Alto",
    shortLabel: "Alto",
    Icon: TrendingUp,
    activeClass:
      "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  {
    id: "base" as CarbMode,
    label: "Base",
    shortLabel: "Base",
    Icon: Minus,
    activeClass:
      "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  {
    id: "off" as CarbMode,
    label: "Carbo Baixo",
    shortLabel: "Baixo",
    Icon: TrendingDown,
    activeClass:
      "bg-amber-500/20 text-amber-300 border-amber-500/40",
  },
] as const;

export default function StickyDietBar({
  carbMode,
  onCarbChange,
  isCooked,
  onCookedChange,
  hasCarbCycle,
  hasCookable,
}: StickyDietBarProps) {
  // Normaliza "low" → "off" para compatibilidade com dados antigos
  const effectiveMode: CarbMode = carbMode === "low" ? "off" : carbMode;

  // Se não há nenhum controle para mostrar, não renderiza a barra
  if (!hasCarbCycle && !hasCookable) return null;

  return (
    <div
      className="sticky top-0 z-20 w-full"
      style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <div className="glass-strong border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-2">

        {/* ── Ciclo de carbo ── */}
        {hasCarbCycle && (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {CARB_OPTIONS.map(({ id, label, shortLabel, Icon, activeClass }) => {
              const active = effectiveMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onCarbChange(id)}
                  className={[
                    "flex-1 min-w-0 flex items-center justify-center gap-1",
                    "h-9 rounded-xl text-[11px] font-bold border transition-all",
                    active
                      ? activeClass
                      : "border-white/10 glass text-muted-foreground hover:border-white/20",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  {/* Label completo em telas maiores, curto em mobile pequeno */}
                  <span className="hidden xs:inline truncate">{label}</span>
                  <span className="xs:hidden">{shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Separador visual quando os dois grupos aparecem ── */}
        {hasCarbCycle && hasCookable && (
          <div className="w-px h-6 bg-white/10 shrink-0" />
        )}

        {/* ── Cru / Cozido ── */}
        {hasCookable && (
          <div className="flex items-center gap-1 shrink-0">
            {[
              { value: false, label: "Cru" },
              { value: true,  label: "Cozido" },
            ].map(({ value, label }) => {
              const active = isCooked === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => onCookedChange(value)}
                  className={[
                    "flex items-center gap-1 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all",
                    active
                      ? "gradient-primary text-white border-primary/40"
                      : "glass border-white/10 text-muted-foreground hover:border-white/20",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  <Scale className="w-3 h-3 opacity-70 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
