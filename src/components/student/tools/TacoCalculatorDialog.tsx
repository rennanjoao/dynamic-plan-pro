/**
 * TacoCalculatorDialog.tsx — Calculadora de substituições TACO+.
 * Equivalência por kcal / proteína / carboidrato / gordura.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator } from "lucide-react";
import { equivalentGrams, type TacoFood, type TacoMode } from "@/data/tacoFoods";
import { searchFoods } from "@/lib/foodSearch";

interface Props { trigger?: React.ReactNode }

const MODE_LABEL: Record<TacoMode, string> = {
  kcal: "Calorias (kcal)",
  p: "Proteína (g)",
  c: "Carboidrato (g)",
  g: "Gordura (g)",
};

function Picker({
  label, value, onPick,
}: { label: string; value: TacoFood | null; onPick: (f: TacoFood) => void }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const results = searchFoods(q, 12);

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Digite para buscar (arroz, frango...)"
          className="h-9 text-sm mt-1"
        />
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
            {results.map((f) => (
              <button
                type="button"
                key={`${f.source}-${f.name}`}
                onClick={() => { onPick(f); setQ(f.name); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex justify-between gap-2"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{f.name}</span>
                  {f.source === "industrial" && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/30 shrink-0">IND</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0">{Math.round(f.kcal)} kcal</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TacoCalculatorDialog({ trigger }: Props) {
  const [from, setFrom] = useState<TacoFood | null>(null);
  const [to, setTo] = useState<TacoFood | null>(null);
  const [grams, setGrams] = useState(100);
  const [mode, setMode] = useState<TacoMode>("kcal");

  const result = from && to ? equivalentGrams(from, grams, to, mode) : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Calculator className="w-3.5 h-3.5" /> TACO+
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🧮 Calculadora TACO+</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Descubra equivalências entre alimentos por kcal, proteína, carboidrato ou gordura.
        </p>

        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Modo de cálculo</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as TacoMode)}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as TacoMode[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-sm">{MODE_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Picker label="De (alimento de origem)" value={from} onPick={setFrom} />

          <div>
            <Label className="text-xs">Quantidade (gramas)</Label>
            <Input
              type="number"
              value={grams}
              onChange={(e) => setGrams(Number(e.target.value) || 0)}
              className="h-9 text-sm mt-1"
            />
          </div>

          <Picker label="Para (alimento substituto)" value={to} onPick={setTo} />

          {result != null && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mt-2">
              <p className="text-xs text-muted-foreground">Equivalente em {to?.name}</p>
              <p className="text-2xl font-bold text-primary">{result.toFixed(0)} g</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Base: {grams} g de {from?.name} · {MODE_LABEL[mode]}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
