import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Tipagens premium ─────────────────────────────────────────────────────────
export interface DietFood {
  name: string;
  weight?: string;
  macroCategory?: "carbo" | "carb" | "protein" | "fat" | "free";
  isRaw?: boolean;
  measureInfo?: string;
}

export interface PremiumMeal {
  id: string;
  name: string;          // ex: "Café da Manhã"
  time?: string;         // ex: "07:00"
  emoji?: string;        // ex: "☀️"
  isRaw?: boolean;       // CRU vs COZIDO global da refeição
  foods?: DietFood[];
  notes?: string;
  supplements?: string;
  // Legado:
  refeicao?: string;
  item?: string;
}

interface DietCardProps {
  meal: PremiumMeal;
  completed: boolean;
  onToggle: (id: string) => void;
}

const CATEGORY_STYLES: Record<string, { wrap: string; title: string; label: string }> = {
  carbo:   { wrap: "bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/30",     title: "text-blue-700 dark:text-blue-400",   label: "ESCOLHA UM CARBOIDRATO" },
  carb:    { wrap: "bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/30",     title: "text-blue-700 dark:text-blue-400",   label: "ESCOLHA UM CARBOIDRATO" },
  protein: { wrap: "bg-red-50 dark:bg-rose-500/5 border-red-200 dark:border-rose-500/30",       title: "text-red-700 dark:text-rose-400",    label: "ESCOLHA UMA PROTEÍNA" },
  fat:     { wrap: "bg-yellow-50 dark:bg-amber-500/5 border-yellow-200 dark:border-amber-500/30", title: "text-amber-700 dark:text-amber-400", label: "ESCOLHA UMA GORDURA" },
};

function groupByCategory(foods: DietFood[]) {
  const groups: Record<string, DietFood[]> = { carbo: [], protein: [], fat: [], free: [] };
  foods.forEach((f) => {
    const cat = f.macroCategory === "carb" ? "carbo" : f.macroCategory || "free";
    (groups[cat] ||= []).push(f);
  });
  return groups;
}

export const DietCard = ({ meal, completed, onToggle }: DietCardProps) => {
  // Compatibilidade com formato legado (refeicao + item)
  const foods = meal.foods ?? [];
  const groups = groupByCategory(foods);
  const order: Array<keyof typeof CATEGORY_STYLES> = ["carbo", "protein", "fat"];

  return (
    <Card className="p-5 shadow-sm card-hover space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2 flex-wrap">
            {meal.emoji && <span>{meal.emoji}</span>}
            <span>{meal.name || meal.refeicao}</span>
            {meal.time && <span className="text-sm font-normal text-muted-foreground">· {meal.time}</span>}
            <Badge variant="outline" className="ml-1 text-[10px] uppercase tracking-wider">
              {meal.isRaw === false ? "Cozido" : "Cru"}
            </Badge>
          </h3>
        </div>
        <Button onClick={() => onToggle(meal.id)} variant={completed ? "default" : "outline"} size="sm" className="shrink-0">
          {completed ? <><CheckCircle2 className="w-4 h-4 mr-2" />Feito</> : <><Circle className="w-4 h-4 mr-2" />Marcar</>}
        </Button>
      </div>

      {/* Legado: item único */}
      {foods.length === 0 && meal.item && (
        <p className="text-sm text-muted-foreground">{meal.item}</p>
      )}

      {/* Categorias */}
      {foods.length > 0 && order.map((cat) => {
        const list = groups[cat] || [];
        if (!list.length) return null;
        const cfg = CATEGORY_STYLES[cat];
        return (
          <div key={cat} className={`rounded-lg border p-3 ${cfg.wrap}`}>
            <p className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${cfg.title}`}>{cfg.label}</p>
            <ul className="space-y-1.5">
              {list.map((f, i) => (
                <li key={i} className="text-sm flex items-baseline justify-between gap-3">
                  <span className="text-foreground">{f.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {f.weight}{f.measureInfo ? ` · ${f.measureInfo}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* Rodapé: observações + suplementos */}
      {(meal.notes || meal.supplements) && (
        <div className="rounded-lg bg-muted/40 border border-border/40 p-3 space-y-2">
          {meal.notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Observações</p>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{meal.notes}</p>
            </div>
          )}
          {meal.supplements && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Suplementos</p>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{meal.supplements}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
