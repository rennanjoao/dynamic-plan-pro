// Curadoria de substituições permitidas por exercício (lado do coach).
// Fica escondido atrás de um ícone discreto na linha do exercício: não ocupa
// espaço na tela de criação enquanto não estiver em uso.
import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Repeat2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLibraryEntry,
  listExercisesByMuscleGroup,
  searchExerciseLibrary,
  type LibraryEntry,
} from "@/lib/exerciseLibrary";

interface Props {
  exerciseName: string;
  gifKey?: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Aberto por fora (menu ⋯ do exercício). */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Sem alternativas definidas, não mostra o ícone (abre só pelo menu). */
  hideWhenEmpty?: boolean;
}

export function ExerciseSubstitutesPopover({ exerciseName, gifKey, value, onChange, open: openProp, onOpenChange, hideWhenEmpty }: Props) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setOpenState(v); };
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ key: string; displayName: string }>>([]);
  const selected = value ?? [];

  // Ponto de partida: exercícios do mesmo grupo muscular primário.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      if (query.trim().length >= 2) {
        const res = await searchExerciseLibrary(query, 12);
        if (alive) setSuggestions(res.map((r) => ({ key: r.key, displayName: r.displayName })));
        return;
      }
      const entry = await getLibraryEntry(exerciseName, gifKey);
      const group = entry?.primaryMuscleGroup ?? null;
      const list: LibraryEntry[] = group ? await listExercisesByMuscleGroup(group, entry?.key ?? null, 20) : [];
      if (alive) setSuggestions(list.map((e) => ({ key: e.key, displayName: e.displayName })));
    })();
    return () => { alive = false; };
  }, [open, query, exerciseName, gifKey]);

  const visible = useMemo(
    () => suggestions.filter((s) => !selected.includes(s.key)),
    [suggestions, selected],
  );

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {hideWhenEmpty && selected.length === 0 ? (
          <span className="inline-block w-0 h-0" aria-hidden />
        ) : (
          <button
            type="button"
            title={
              selected.length
                ? `${selected.length} alternativa(s) para a aluna`
                : "Alternativas para a aluna (opcional)"
            }
            className={cn(
              "p-1 rounded transition-colors inline-flex items-center",
              selected.length ? "text-primary" : "text-muted-foreground hover:text-primary",
            )}
            data-testid="substitutes-chip"
          >
            <Repeat2 className="w-3.5 h-3.5" />
            {selected.length > 0 && (
              <span className="ml-0.5 text-[9px] font-bold align-top">{selected.length}</span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-2 space-y-2">
        <p className="text-[11px] font-semibold text-foreground">Alternativas para a aluna</p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          Opcional. Se vazio, a aluna pode trocar por exercícios do mesmo grupo muscular.
        </p>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((k) => (
              <span key={k} className="flex items-center gap-1 text-[10px] rounded-full border border-primary/40 bg-primary/10 text-primary px-2 py-0.5">
                {k.replace(/_/g, " ")}
                <button type="button" onClick={() => toggle(k)} aria-label="Remover">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar exercício…"
          className="h-7 text-xs"
        />
        <div className="max-h-[180px] overflow-y-auto space-y-0.5">
          {visible.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-2 text-center">Nenhuma sugestão.</p>
          ) : (
            visible.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                className="w-full text-left text-[11px] rounded px-2 py-1 hover:bg-accent truncate"
              >
                {s.displayName}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
