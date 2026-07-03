import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchExerciseLibrary } from "@/lib/exerciseLibrary";
import { cn } from "@/lib/utils";

interface Suggestion {
  key: string;
  displayName: string;
  url: string;
}

interface Props {
  value: string;
  gifKey?: string;
  onChange: (patch: { name: string; gifKey?: string }) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Combobox de exercício para o coach: enquanto ele digita, sugere itens da
 * biblioteca (com miniatura do gif). Ao selecionar, grava name + gifKey.
 * Se o coach editar o texto depois de já ter selecionado, o gifKey é limpo
 * para não deixar um gif errado grudado num nome diferente.
 * Se digitar livremente e não bater com nada, salva sem gifKey (fallback por nome).
 */
export function ExercisePickerInput({ value, gifKey, onChange, placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    let alive = true;
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      searchExerciseLibrary(q, 8).then((res) => {
        if (!alive) return;
        setSuggestions(res);
        setHighlight(0);
      });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [value]);

  const showList = open && suggestions.length > 0;

  const handlePick = (s: Suggestion) => {
    skipNextSearch.current = true;
    onChange({ name: s.displayName, gifKey: s.key });
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <Popover open={showList} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              // se editou depois de já ter gifKey, invalida (nome mudou → gif pode não bater mais)
              onChange({ name: e.target.value, gifKey: gifKey ? undefined : gifKey });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); handlePick(suggestions[highlight]); }
              else if (e.key === "Escape") { setOpen(false); }
            }}
            placeholder={placeholder}
            className={cn("h-8 text-xs", gifKey && "border-primary/40", className)}
            title={gifKey ? `GIF vinculado: ${gifKey}` : "Digite para buscar na biblioteca de exercícios"}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="p-1 w-[320px] max-h-[280px] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {suggestions.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handlePick(s); }}
            onMouseEnter={() => setHighlight(i)}
            className={cn(
              "flex items-center gap-2 w-full text-left rounded px-2 py-1.5 text-xs",
              i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            )}
          >
            <img
              src={s.url}
              alt=""
              loading="lazy"
              className="w-8 h-8 rounded object-cover bg-muted flex-shrink-0"
            />
            <span className="truncate">{s.displayName}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
