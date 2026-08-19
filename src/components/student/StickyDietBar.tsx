/**
 * StickyDietBar.tsx
 *
 * Barra sticky global da aba de dieta.
 * Fica colada no topo enquanto o aluno rola a tela.
 *
 * Controles:
 *  - Ciclo de carbo: [ Alto | Base | Baixo ]  (só aparece se o coach ativou carbCycle)
 *  - Cru / Cozido: toggle compacto
 *  - Pérolas de progresso de refeições
 *
 * O estado vive no StructuredMealsViewer (pai) e desce via props.
 * Os MealCards não guardam mais estado local de isCooked.
 *
 * Layout responsivo (correção):
 *  - Em telas estreitas os 3 grupos (carbo / cru-cozido / progresso) não
 *    cabiam numa linha só, e o ancestral direto (`StructuredMealsViewer`)
 *    tem `overflow-x-hidden` — então o que não coubesse era CORTADO, não
 *    quebrava linha nem virava scroll. Era a causa do "desenquadrado" no
 *    mobile. Abaixo de `sm` (640px) os grupos empilham em até 2 linhas
 *    (carbo em cima, cru/cozido + progresso embaixo); a partir de `sm`
 *    volta ao layout de uma linha só, igual antes.
 *  - O rótulo alternativo por `xs:` foi removido: esse breakpoint nunca
 *    existiu em tailwind.config.ts, então `xs:inline`/`xs:hidden` não
 *    tinham efeito nenhum — na prática só o rótulo curto sempre aparecia.
 *    Ficou só o rótulo curto (que já era o que renderizava de fato).
 */

import { TrendingUp, TrendingDown, Minus, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { type CarbMode } from "@/components/student/CarbCycleSelector";

interface StickyDietBarProps {
  carbMode: CarbMode;
  onCarbChange: (m: CarbMode) => void;
  isCooked: boolean;
  onCookedChange: (v: boolean) => void;
  hasCarbCycle: boolean;
  hasCookable: boolean;
  /** Progresso opcional de refeições feitas (pérolas à direita). */
  totalMeals?: number;
  doneCount?: number;
  progressPct?: number;
  checked?: Record<number, boolean>;
}

const CARB_OPTIONS = [
  { id: "high" as CarbMode, label: "Alto", Icon: TrendingUp, activeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { id: "base" as CarbMode, label: "Base", Icon: Minus, activeClass: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  { id: "off" as CarbMode, label: "Baixo", Icon: TrendingDown, activeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
] as const;

function CarbGroup({
  carbMode,
  onCarbChange,
  className,
}: {
  carbMode: CarbMode;
  onCarbChange: (m: CarbMode) => void;
  className?: string;
}) {
  const effectiveMode: CarbMode = carbMode === "low" ? "off" : carbMode;
  return (
    <div className={cn("flex items-center gap-1 min-w-0 w-full", className)}>
      {CARB_OPTIONS.map(({ id, label, Icon, activeClass }) => {
        const active = effectiveMode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onCarbChange(id)}
            className={[
              "flex-1 min-w-0 flex items-center justify-center gap-1",
              "h-9 rounded-xl text-[11px] font-bold border transition-all",
              active ? activeClass : "border-white/10 glass text-muted-foreground hover:border-white/20",
            ].join(" ")}
            aria-pressed={active}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CookedGroup({ isCooked, onCookedChange }: { isCooked: boolean; onCookedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {[
        { value: false, label: "Cru" },
        { value: true, label: "Cozido" },
      ].map(({ value, label }) => {
        const active = isCooked === value;
        return (
          <button
            key={String(value)}
            type="button"
            onClick={() => onCookedChange(value)}
            className={[
              "flex items-center gap-1 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all",
              active ? "gradient-primary text-white border-primary/40" : "glass border-white/10 text-muted-foreground hover:border-white/20",
            ].join(" ")}
            aria-pressed={active}
          >
            <Scale className="w-3 h-3 opacity-70 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ProgressGroup({
  totalMeals,
  doneCount,
  progressPct,
  checked,
}: {
  totalMeals: number;
  doneCount: number;
  progressPct: number;
  checked: Record<number, boolean>;
}) {
  return (
    <div
      className="flex items-center gap-1 shrink-0 ml-auto"
      title={`${doneCount}/${totalMeals} refeições feitas (${progressPct}%)`}
      aria-label={`Progresso de refeições: ${doneCount} de ${totalMeals}`}
    >
      {Array.from({ length: totalMeals }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-2 h-2 rounded-full border transition-colors shrink-0",
            checked[i] ? "bg-emerald-500 border-emerald-500" : "bg-transparent border-white/25",
          )}
        />
      ))}
      <span className="text-[10px] font-bold text-emerald-400 tabular-nums ml-1 shrink-0">
        {doneCount}/{totalMeals}
      </span>
    </div>
  );
}

export default function StickyDietBar({
  carbMode,
  onCarbChange,
  isCooked,
  onCookedChange,
  hasCarbCycle,
  hasCookable,
  totalMeals = 0,
  doneCount = 0,
  progressPct = 0,
  checked = {},
}: StickyDietBarProps) {
  const hasProgress = totalMeals > 0;
  const hasSecondaryRow = hasCookable || hasProgress;

  // Se não há nenhum controle para mostrar, não renderiza a barra
  if (!hasCarbCycle && !hasSecondaryRow) return null;

  return (
    <div
      className="sticky top-0 z-20 w-full"
      style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <div
        className={cn(
          "glass-strong border-b border-white/[0.06] px-4 py-2.5",
          // Mobile: grupos empilhados, cada um ocupando a largura toda.
          // sm+: volta a ser uma linha só, como era antes.
          "flex flex-col gap-2 sm:flex-row sm:items-center",
        )}
      >
        {/* ── Ciclo de carbo ── */}
        {hasCarbCycle && <CarbGroup carbMode={carbMode} onCarbChange={onCarbChange} className="sm:flex-1" />}

        {/* ── Divisor — só existe quando os dois grupos dividem a mesma linha (sm+) ── */}
        {hasCarbCycle && hasSecondaryRow && (
          <div className="hidden sm:block w-px h-6 bg-white/10 shrink-0" />
        )}

        {/* ── Cru/Cozido + progresso — linha própria no mobile, sm:shrink-0 pra não competir com o carbo ── */}
        {hasSecondaryRow && (
          <div className="flex items-center gap-2 sm:shrink-0">
            {hasCookable && <CookedGroup isCooked={isCooked} onCookedChange={onCookedChange} />}
            {hasProgress && (
              <ProgressGroup totalMeals={totalMeals} doneCount={doneCount} progressPct={progressPct} checked={checked} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
