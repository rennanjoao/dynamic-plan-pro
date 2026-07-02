/**
 * TacoCalculatorDialog.tsx — Calculadora de substituições TACO+.
 * Equivalência por kcal / proteína / carboidrato / gordura.
 *
 * [FIX MOBILE] Problema original: no mobile, o teclado virtual subia e cobria
 * o dropdown de resultados do segundo Picker ("Para"), que ficava abaixo do campo
 * e fora da área visível. O aluno precisava arrastar manualmente para ver as opções.
 *
 * Correções aplicadas:
 * 1. DialogContent usa `max-h-[90dvh]` (dynamic viewport height) em vez de `85vh`
 *    — recalculado automaticamente quando o teclado sobe em iOS/Android.
 * 2. O segundo Picker recebe dropUp=true → dropdown abre ACIMA do input (bottom-full)
 *    em vez de abaixo, ficando sempre visível mesmo com teclado aberto.
 * 3. scrollIntoView no onFocus garante que o input fique centralizado na área visível
 *    após o teclado subir (~300ms de delay para aguardar a animação).
 * 4. onMouseDown com preventDefault() nos itens do dropdown evita que o blur feche
 *    a lista antes do click ser registrado (bug clássico em mobile).
 * 5. Lista reduzida para 8 resultados (era 12) para caber melhor na tela menor.
 */
import { useState, useRef } from "react";
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
  label, value, onPick, dropUp = false,
}: {
  label: string;
  value: TacoFood | null;
  onPick: (f: TacoFood) => void;
  dropUp?: boolean;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const results = searchFoods(q, 8); // reduzido de 12 → 8 para caber melhor em mobile
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Scroll o input para o centro da área visível depois que o teclado virtual sobe
  const handleFocus = () => {
    setOpen(true);
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 320); // aguarda animação do teclado (~300ms em iOS)
  };

  // Fecha o dropdown ao perder foco, mas só se o novo foco não for um item da lista
  const handleBlur = (e: React.FocusEvent) => {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={wrapperRef}>
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Digite para buscar (arroz, frango...)"
          className="h-9 text-sm mt-1"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {open && results.length > 0 && (
          <div
            className={`absolute z-30 w-full max-h-44 overflow-y-auto rounded-md border border-border bg-popover shadow-lg ${
              dropUp ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            {results.map((f) => (
              <button
                type="button"
                key={`${f.source}-${f.name}`}
                onMouseDown={(e) => e.preventDefault()} // evita blur antes do click em mobile
                onClick={() => { onPick(f); setQ(f.name); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-muted/60 flex justify-between gap-2 border-b border-border/30 last:border-0"
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

      {/*
        max-h-[90dvh]: usa dynamic viewport height (dvh) — recalculado quando
        o teclado virtual sobe em iOS/Android, diferente de vh que é estático.
        pb-4 garante espaço abaixo do último elemento.
      */}
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto pb-4">
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

          {/* Primeiro Picker: dropdown abre para baixo (posição normal) */}
          <Picker label="De (alimento de origem)" value={from} onPick={setFrom} />

          <div>
            <Label className="text-xs">Quantidade (gramas)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={grams}
              onChange={(e) => setGrams(Number(e.target.value) || 0)}
              className="h-9 text-sm mt-1"
            />
          </div>

          {/*
            Segundo Picker: dropUp=true → dropdown abre para CIMA (bottom-full).
            É o último campo do formulário — sem espaço abaixo, o teclado
            cobria completamente a lista. Abrindo para cima fica sempre visível.
          */}
          <Picker
            label="Para (alimento substituto)"
            value={to}
            onPick={setTo}
            dropUp
          />

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
