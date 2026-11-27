/**
 * Peças do editor de treinos (aba Treinos do protocolo), da limpeza aprovada
 * pelo Rennan em 20/11/2026:
 *  - WeekStripEditor: a faixa da semana é o ÚNICO lugar de escolher o treino
 *    de cada dia (clica no dia) e o carbo (clica no carbo).
 *  - WorkoutMenu / ExerciseMenu: ações num menu ⋯ (em vez de 5-6 ícones).
 *  - RxInput: campo de séries/reps/cadência/descanso com rótulo no celular e
 *    marca de exceção quando a periodização está ligada.
 *  - CardioSection: aeróbicos num lugar só, vinculados a treino, a qualquer
 *    dia da semana (inclusive descanso) ou sem vínculo.
 *  - O botão "Modelos" agora é o ModelsMenu (mesmo botão em todas as abas).
 */
import { useState } from "react";
import {
  Activity, ArrowDown, ArrowUp, ArrowUpDown, Copy, MoreHorizontal, Plus,
  Repeat2, StretchHorizontal, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CARB_LABEL, DAY_KEYS, normalizeCarb } from "@/lib/weekCycle";
import { INVERT_LABEL, INVERT_OPTIONS, type InvertMode } from "@/lib/workoutInversion";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import { DAY_LABEL, cardioFromLink, cardioLinkValue } from "@/lib/cardioLink";

const ABBR: Record<string, string> = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };

// ── Faixa da semana ──────────────────────────────────────────────────────────

export function WeekStripEditor({
  workouts,
  weekDays,
  carbCycle,
  today,
  letterOf,
  onSetDay,
  onCycleCarb,
  showCarb = true,
  onOpenMacros,
}: {
  workouts: Array<{ key?: string; focus?: string }>;
  weekDays: Record<string, string>;
  carbCycle: Record<string, unknown>;
  today: string;
  letterOf: (workoutKey: string) => string;
  /** value "" = sem treino definido; "REST" = descanso. */
  onSetDay: (day: string, value: string) => void;
  onCycleCarb: (day: string) => void;
  /**
   * Carbo por dia só aparece com o ciclo ligado (aba Macros). Desligado, os
   * selos "BASE" não faziam nada para o aluno — e clicar neles confundia.
   */
  showCarb?: boolean;
  /** Atalho "ligar em Macros" quando o ciclo está desligado. */
  onOpenMacros?: () => void;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  return (
    <Card className="bg-card/40 border-border p-2.5" data-testid="week-strip">
      <div className="flex items-center justify-between mb-1.5 px-1 gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Semana</p>
        <p className="text-[11px] text-muted-foreground text-right">
          Toque no dia para escolher o treino
          {showCarb ? " · no carbo para Alto · Base · Baixo" : (
            <>
              {" · ciclo de carbo desligado"}
              {onOpenMacros && (
                <> (<button type="button" onClick={onOpenMacros} className="underline underline-offset-2 hover:text-foreground" data-testid="week-strip-open-macros">ligar em Macros</button>)</>
              )}
            </>
          )}
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DAY_KEYS.map((k) => {
          const carb = normalizeCarb(carbCycle?.[k]);
          const wk = weekDays[k] ?? "";
          const label = wk === "REST" ? "Desc." : wk ? letterOf(wk) : "—";
          return (
            <div
              key={k}
              className={cn(
                "rounded-lg border bg-background/60 px-0.5 py-1 flex flex-col items-center gap-0.5",
                k === today ? "border-[#CC0000]" : "border-border/40",
              )}
            >
              <Popover open={openDay === k} onOpenChange={(v) => setOpenDay(v ? k : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex flex-col items-center rounded-md hover:bg-muted/60 py-0.5"
                    title={`${DAY_LABEL[k]}: escolher treino`}
                    data-testid={`day-${k}`}
                  >
                    <span className="text-[11px] uppercase text-muted-foreground tracking-wider">{ABBR[k]}</span>
                    <span className={cn("text-[12px] font-bold leading-none", wk === "REST" ? "text-muted-foreground" : "text-foreground")}>{label}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="center">
                  <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">{DAY_LABEL[k]}</p>
                  {workouts.map((w) => {
                    const key = String(w.key ?? "");
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { onSetDay(k, key); setOpenDay(null); }}
                        className={cn("w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted", wk === key && "bg-primary/10 text-primary font-semibold")}
                        data-testid={`day-${k}-opt-${key}`}
                      >
                        Treino {letterOf(key)}{w.focus ? <span className="text-muted-foreground font-normal"> · {w.focus}</span> : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { onSetDay(k, "REST"); setOpenDay(null); }}
                    className={cn("w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted", wk === "REST" && "bg-primary/10 text-primary font-semibold")}
                    data-testid={`day-${k}-opt-REST`}
                  >
                    Descanso
                  </button>
                  {wk && (
                    <button
                      type="button"
                      onClick={() => { onSetDay(k, ""); setOpenDay(null); }}
                      className="w-full text-left rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Limpar dia
                    </button>
                  )}
                </PopoverContent>
              </Popover>
              {showCarb && (
              <button
                type="button"
                onClick={() => onCycleCarb(k)}
                title={`Carbo ${CARB_LABEL[carb]} — toque para alternar`}
                className={cn(
                  "text-[11px] font-bold uppercase tracking-wider px-1 py-px rounded border leading-none",
                  carb === "high"
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/40"
                    : "bg-muted/40 text-muted-foreground border-border/50",
                )}
                data-testid={`carb-${k}`}
              >
                {CARB_LABEL[carb]}
              </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Menu ⋯ do treino ────────────────────────────────────────────────────────

export function WorkoutMenu({
  letter,
  invertMode,
  canMoveUp,
  canMoveDown,
  onInvert,
  onInvertAll,
  onDuplicate,
  onMove,
  onDelete,
}: {
  letter: string;
  invertMode: InvertMode;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onInvert: (m: InvertMode) => void;
  onInvertAll: () => void;
  onDuplicate: () => void;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" aria-label={`Opções do Treino ${letter}`} data-testid={`workout-menu-${letter}`}>
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDown className="w-4 h-4 mr-2" /> Inverter a ordem
            {invertMode !== "off" && <span className="ml-auto text-[11px] text-primary">ligado</span>}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Mobilidade continua sempre antes.</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={invertMode} onValueChange={(v) => onInvert(v as InvertMode)}>
              {INVERT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value} className="flex-col items-start" data-testid={`invert-${letter}-${o.value}`}>
                  <span className="text-xs font-medium">{o.label}</span>
                  <span className="text-[11px] text-muted-foreground">{o.hint}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onInvertAll} className="text-xs" data-testid={`invert-all-from-${letter}`}>
              Usar esta regra em todos os treinos
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={onDuplicate}><Copy className="w-4 h-4 mr-2" /> Duplicar treino</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove("up")} disabled={!canMoveUp}><ArrowUp className="w-4 h-4 mr-2" /> Mover para cima</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove("down")} disabled={!canMoveDown}><ArrowDown className="w-4 h-4 mr-2" /> Mover para baixo</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> Excluir treino
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Selo discreto no cabeçalho quando a ordem do treino inverte. */
export function InvertBadge({ mode }: { mode: InvertMode }) {
  if (mode === "off") return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/5 px-1.5 py-0.5 text-[11px] font-semibold text-primary shrink-0"
      title={`Inverte a ordem: ${INVERT_LABEL[mode].toLowerCase()}`}
      data-testid="invert-badge"
    >
      <ArrowUpDown className="w-3 h-3" /> inverte
    </span>
  );
}

// ── Menu ⋯ do exercício ─────────────────────────────────────────────────────

export function ExerciseMenu({
  name,
  substitutesCount,
  canMoveUp,
  canMoveDown,
  onAlternatives,
  onToMobility,
  onMove,
  onDelete,
}: {
  name: string;
  substitutesCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAlternatives: () => void;
  onToMobility: () => void;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" aria-label={`Opções de ${name || "exercício"}`} data-testid="exercise-menu">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={onAlternatives}>
          <Repeat2 className="w-4 h-4 mr-2" /> Alternativas para a aluna
          {substitutesCount > 0 && <span className="ml-auto text-[11px] text-primary">{substitutesCount}</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToMobility}><StretchHorizontal className="w-4 h-4 mr-2" /> Mover para mobilidade</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove("up")} disabled={!canMoveUp}><ArrowUp className="w-4 h-4 mr-2" /> Subir</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove("down")} disabled={!canMoveDown}><ArrowDown className="w-4 h-4 mr-2" /> Descer</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive" data-testid="exercise-delete">
          <Trash2 className="w-4 h-4 mr-2" /> Excluir exercício
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Campo de prescrição ─────────────────────────────────────────────────────

const RX_LABEL = { sets: "Séries", reps: "Reps", cadence: "Cadência", rest: "Descanso" } as const;

export function RxInput({
  field,
  value,
  placeholder,
  exception,
  mixed,
  onChange,
}: {
  field: keyof typeof RX_LABEL;
  value: string;
  placeholder: string;
  /** Periodização ligada e o coach digitou: vale nas 4 semanas para este exercício. */
  exception?: boolean;
  /** Periodização ligada e a exceção muda de semana para semana. */
  mixed?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="md:hidden block text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">{RX_LABEL[field]}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mixed ? "varia por semana" : placeholder}
        aria-label={RX_LABEL[field]}
        title={exception || mixed ? "Exceção deste exercício (vale nas semanas da periodização)" : undefined}
        className={cn("h-8 text-base md:text-sm", (exception || mixed) && "border-primary/70 bg-primary/5")}
        data-testid={`rx-${field}`}
        data-exception={exception || mixed ? "true" : undefined}
      />
    </label>
  );
}

// ── Aeróbicos (um lugar só) ─────────────────────────────────────────────────

type Cardio = ProtocolPayload["cardio"][number];

export function CardioSection({
  cardio,
  workouts,
  weekDays,
  letterOf,
  onChange,
}: {
  cardio: Cardio[];
  workouts: Array<{ key?: string; focus?: string }>;
  weekDays: Record<string, string>;
  letterOf: (workoutKey: string) => string;
  onChange: (next: Cardio[]) => void;
}) {
  const patch = (i: number, p: Partial<Cardio>) => onChange(cardio.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const dayHint = (d: string) => {
    const wk = weekDays[d];
    if (wk === "REST") return "descanso";
    if (wk) return `Treino ${letterOf(wk)}`;
    return "sem treino";
  };
  const workoutKeys = new Set(workouts.map((w) => String(w.key ?? "")));
  return (
    <div className="mt-4 space-y-2" data-testid="cardio-section">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Aeróbicos</Label>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange([...cardio, { type: "", duration: "", intensity: "", workoutKey: "", associationType: "workout", notes: "" }])}
          data-testid="cardio-add"
        >
          <Plus className="w-3 h-3 mr-1" /> Aeróbico
        </Button>
      </div>
      {cardio.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border/40 rounded-lg">
          Nenhum aeróbico. Pode vincular a um treino ou a qualquer dia da semana, inclusive de descanso.
        </p>
      )}
      {cardio.map((c, ci) => {
        const link = cardioLinkValue(c);
        const orphan = c.associationType === "workout" && !!c.workoutKey && !workoutKeys.has(c.workoutKey);
        return (
          <Card key={ci} className="bg-card/60 border-border p-3 space-y-2" data-testid={`cardio-${ci}`}>
            <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Tipo</Label>
                <Select value={c.type || "Outro"} onValueChange={(v) => patch(ci, { type: v })}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>{["AEJ", "LISS", "HIIT", "Caminhada", "Bicicleta", "Outro"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Vinculado a</Label>
                <Select value={orphan ? "none" : link} onValueChange={(v) => patch(ci, cardioFromLink(v))}>
                  <SelectTrigger className="h-8 text-xs mt-1" data-testid={`cardio-link-${ci}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">Sem vínculo (geral)</SelectItem>
                    {workouts.map((w) => {
                      const key = String(w.key ?? "");
                      return (
                        <SelectItem key={key} value={`w:${key}`} className="text-xs">
                          Treino {letterOf(key)}{w.focus ? ` · ${w.focus}` : ""}
                        </SelectItem>
                      );
                    })}
                    {DAY_KEYS.map((d) => (
                      <SelectItem key={d} value={`d:${d}`} className="text-xs">
                        {DAY_LABEL[d]} ({dayHint(d)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => onChange(cardio.filter((_, j) => j !== ci))}
                className="text-muted-foreground hover:text-destructive p-1.5"
                aria-label="Excluir aeróbico"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {orphan && <p className="text-[11px] text-amber-600">O treino deste aeróbico foi excluído — escolha outro vínculo.</p>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Duração</Label>
                <Input value={c.duration} onChange={(e) => patch(ci, { duration: e.target.value })} placeholder="40 min" className="h-8 text-base md:text-sm mt-1" />
              </div>
              <div>
                <Label className="text-[11px] uppercase text-muted-foreground">Intensidade</Label>
                <Select value={c.intensity || "Moderada"} onValueChange={(v) => patch(ci, { intensity: v })}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Leve", "Moderada", "Alta"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input value={c.notes} onChange={(e) => patch(ci, { notes: e.target.value })} placeholder="Observações" className="h-8 text-base md:text-sm" />
          </Card>
        );
      })}
    </div>
  );
}

