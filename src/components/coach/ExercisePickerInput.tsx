import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchExerciseLibrary, upsertExerciseClassification } from "@/lib/exerciseLibrary";
import { cn } from "@/lib/utils";
import {
  getLastPrescription,
  QUICK_SET_PRESETS,
  type RememberedPrescription,
} from "@/lib/prescriptionMemory";
import {
  classifyExerciseByName,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type MuscleGroup,
} from "@/lib/muscleGroupClassifier";
import { toExerciseKey } from "@/lib/workoutTypes";
import { X, Maximize2 } from "lucide-react";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { ExerciseGifDialog } from "@/components/shared/ExerciseGifDialog";

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
  /** Coach atual — habilita memória de prescrição por exercício. */
  coachId?: string | null;
  /** Se fornecido, ao selecionar exercício restaura Sets/Reps/Cadência/Descanso. */
  onPrescriptionRestore?: (rx: RememberedPrescription) => void;
  /** Habilita chips de preset (4x8-12 etc). O callback recebe {sets, reps}. */
  onQuickPreset?: (preset: { sets: string; reps: string }) => void;
}

/**
 * Combobox de exercício para o coach: enquanto ele digita, sugere itens da
 * biblioteca (com miniatura do gif). Ao selecionar, grava name + gifKey.
 * Se o coach editar o texto depois de já ter selecionado, o gifKey é limpo
 * para não deixar um gif errado grudado num nome diferente.
 * Se digitar livremente e não bater com nada, salva sem gifKey (fallback por nome).
 */
export function ExercisePickerInput({
  value, gifKey, onChange, placeholder, className,
  coachId, onPrescriptionRestore, onQuickPreset,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextSearch = useRef(false);
  const skipNextBlur = useRef(false);
  // Prompt inline de grupo muscular — só aparece quando o coach digita um
  // nome novo que o classificador não reconheceu. Nunca bloqueia salvar.
  const [needsGroupPrompt, setNeedsGroupPrompt] = useState<string | null>(null);
  const lastHandledName = useRef<string>("");
  const [showGif, setShowGif] = useState(false);
  const gifUrl = useExerciseGif(value, gifKey);


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
    skipNextBlur.current = true;
    onChange({ name: s.displayName, gifKey: s.key });
    setSuggestions([]);
    setOpen(false);
    setNeedsGroupPrompt(null);
    inputRef.current?.blur();
    if (coachId && onPrescriptionRestore) {
      const rx = getLastPrescription(coachId, s.displayName);
      if (rx && (rx.sets || rx.reps || rx.cadence || rx.rest)) {
        onPrescriptionRestore(rx);
      }
    }
  };

  // Ao sair do campo, se o coach digitou um nome livre que não bate com
  // nenhum item da biblioteca, tenta classificar silenciosamente. Se o
  // classificador reconhecer, grava direto. Se não, oferece um seletor
  // opcional (com botão "Pular") logo abaixo do input.
  const handleBlur = async () => {
    if (skipNextBlur.current) {
      skipNextBlur.current = false;
      return;
    }
    const name = value.trim();
    if (!name || name.length < 3) return;
    if (gifKey) return; // já tem match na biblioteca via seleção
    if (name === lastHandledName.current) return;
    lastHandledName.current = name;
    const key = toExerciseKey(name);
    const classification = classifyExerciseByName(name);
    if (classification.confidence === "auto" && classification.primary) {
      const result = await upsertExerciseClassification({
        exerciseKey: key,
        displayName: name,
        primaryMuscleGroup: classification.primary,
        secondaryMuscleGroups: classification.secondary,
        source: "auto",
      });
      if (!result.ok) {
        console.warn("[classificacao-grupo-muscular] falha ao salvar:", result.error);
      }
      setNeedsGroupPrompt(null);
    } else {
      // Registra como unclassified (silencioso) e mostra o prompt inline.
      const result = await upsertExerciseClassification({
        exerciseKey: key,
        displayName: name,
        primaryMuscleGroup: null,
        secondaryMuscleGroups: [],
        source: "unclassified",
      });
      if (!result.ok) {
        console.warn("[classificacao-grupo-muscular] falha ao salvar:", result.error);
      }
      setNeedsGroupPrompt(key);
    }
  };

  const resolveGroupPrompt = async (group: MuscleGroup | null) => {
    if (!needsGroupPrompt) return;
    if (group) {
      const result = await upsertExerciseClassification({
        exerciseKey: needsGroupPrompt,
        displayName: value.trim(),
        primaryMuscleGroup: group,
        secondaryMuscleGroups: [],
        source: "manual",
      });
      if (!result.ok) {
        console.warn("[classificacao-grupo-muscular] falha ao salvar:", result.error);
      }
    }
    setNeedsGroupPrompt(null);
  };

  return (
    <div className="flex flex-col">
    <div className="flex items-start gap-2">
      {gifUrl && (
        <button
          type="button"
          onClick={() => setShowGif(true)}
          className="relative w-9 h-9 rounded overflow-hidden shrink-0 border border-border/60 group"
          title="Ver gif em tamanho maior"
        >
          <img src={gifUrl} alt="" loading="lazy" className="w-full h-full object-cover bg-muted" />
          <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50">
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </span>
        </button>
      )}
      <div className="flex-1 min-w-0">
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
            onBlur={handleBlur}
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
              className="w-12 h-12 rounded object-cover bg-muted flex-shrink-0"
            />
            <span className="truncate">{s.displayName}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
      </div>
    </div>
    {onQuickPreset && (
      <div className="flex flex-wrap gap-1 mt-1">
        {QUICK_SET_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onQuickPreset({ sets: p.sets, reps: p.reps })}
            className="text-[10px] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    )}
    {needsGroupPrompt && (
      <div className="mt-1 flex items-center gap-1 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-1">
        <span className="text-[10px] text-muted-foreground shrink-0">Grupo muscular?</span>
        <select
          className="h-6 text-[10px] rounded border border-border/60 bg-background px-1 flex-1 min-w-0"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value as MuscleGroup | "";
            if (v) resolveGroupPrompt(v);
          }}
        >
          <option value="" disabled>Selecionar…</option>
          {MUSCLE_GROUP_OPTIONS.map((g) => (
            <option key={g} value={g}>{MUSCLE_GROUP_LABELS[g]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => resolveGroupPrompt(null)}
          title="Pular — revisar depois"
          className="text-[10px] text-muted-foreground hover:text-foreground px-1"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )}
    </div>
  );
}
