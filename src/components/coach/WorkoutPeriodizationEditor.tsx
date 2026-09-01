import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Calendar, Loader2, Check,
  Eye, Copy, RefreshCcw, AlertCircle, ChevronDown, Minimize2, Wand2, Library, ArrowRightLeft
} from "lucide-react";

import { toast } from "sonner";
import {
  PeriodizationSchema,
  type ProtocolPayload,
} from "@/lib/protocolSchema";
import { validatePeriodization } from "@/lib/periodizationValidation";
import WeekPreviewDialog from "./WeekPreviewDialog";
import { checkMuscleRecovery } from "@/lib/muscleRecovery";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmProvider";

interface Props {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
  onOpenTemplateLibrary?: () => void;
}

function exId(dayKey: string, idx: number) {
  return `${dayKey}_${idx}`;
}

export default function WorkoutPeriodizationEditor({ payload, setPayload, coachId, onOpenTemplateLibrary }: Props) {
  const p = payload.periodization;
  const confirm = useConfirm();
  const [previewWeek, setPreviewWeek] = useState<number | null>(null);
  
  // Estado para controlar a expansão das substituições de cada semana individualmente
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({});
  
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("perio_collapsed") === "true";
  });
  
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("perio_collapsed", String(next)); } catch { /* noop */ }
  };

  const toggleWeekExpansion = (i: number) => {
    setExpandedWeeks(prev => ({ ...prev, [i]: !prev[i] }));
  };

  const validation = useMemo(() => validatePeriodization(payload), [payload]);
  const errorByWeek = useMemo(() => {
    const map: Record<number, Record<string, string>> = {};
    validation.weekErrors.forEach((e) => {
      map[e.weekIndex] = { ...(map[e.weekIndex] || {}), [e.field]: e.message };
    });
    return map;
  }, [validation]);
  const overrideErrSet = useMemo(() => {
    const s = new Set<string>();
    validation.overrideErrors.forEach((e) => s.add(`${e.weekIndex}|${e.exerciseId}|${e.field}`));
    return s;
  }, [validation]);

  const updateWeek = (i: number, field: keyof typeof p.weeks[number], value: string) => {
    const weeks = p.weeks.map((w, idx) => (idx === i ? { ...w, [field]: value } : w));
    setPayload({ ...payload, periodization: { ...p, weeks } });
  };

  const setOverride = (weekIdx: number, id: string, patch: Record<string, string>) => {
    const key = String(weekIdx);
    const next = { ...(p.overrides || {}) } as Record<string, Record<string, any>>;
    next[key] = { ...(next[key] || {}), [id]: { ...(next[key]?.[id] || {}), ...patch } };
    // limpa entradas vazias
    Object.keys(next[key][id]).forEach((k) => {
      if (!next[key][id][k]) delete next[key][id][k];
    });
    if (Object.keys(next[key][id]).length === 0) delete next[key][id];
    setPayload({ ...payload, periodization: { ...p, overrides: next } });
  };

  /**
   * Aplica em massa um valor (sets/reps/cadence/rest) para todos os
   * exercícios da semana informada, sobrescrevendo apenas o campo escolhido.
   */
  const bulkApplyWeek = (
    weekIdx: number,
    field: "sets" | "reps" | "cadence" | "rest",
    value: string,
  ) => {
    if (!value.trim()) return;
    const key = String(weekIdx);
    const next = { ...(p.overrides || {}) } as Record<string, Record<string, any>>;
    next[key] = { ...(next[key] || {}) };
    (payload.workouts || []).forEach((day) => {
      (day.exercises || []).forEach((_ex, ei) => {
        const id = exId(day.key, ei);
        next[key][id] = { ...(next[key][id] || {}), [field]: value };
      });
    });
    setPayload({ ...payload, periodization: { ...p, overrides: next } });
    toast.success(`${field} aplicado em massa na semana ${weekIdx + 1}`);
  };

  function duplicateWeek(from: number, to: number) {
    if (from === to) return;
    const weeks = p.weeks.map((w, idx) => (idx === to ? { ...p.weeks[from], label: w.label } : w));
    const overrides = { ...(p.overrides || {}) };
    // Copia também todas as substituições específicas (item a item) da semana de origem.
    const src = overrides[String(from)];
    if (src && Object.keys(src).length > 0) {
      overrides[String(to)] = JSON.parse(JSON.stringify(src));
    } else {
      delete overrides[String(to)];
    }
    setPayload({ ...payload, periodization: { ...p, weeks, overrides } });
    const n = src ? Object.keys(src).length : 0;
    toast.success(
      `Semana ${from + 1} copiada para Semana ${to + 1}${n ? ` (${n} substituição(ões) incluída(s))` : ""}`,
    );
  }


  function resetWeekToDefault(i: number) {
    const defaults = PeriodizationSchema.parse({}).weeks;
    const weeks = p.weeks.map((w, idx) => (idx === i ? defaults[i] : w));
    const overrides = { ...(p.overrides || {}) };
    delete overrides[String(i)];
    setPayload({ ...payload, periodization: { ...p, weeks, overrides } });
    toast.success(`Semana ${i + 1} restaurada ao padrão`);
  }

  async function resetAllToDefault() {
    if (!(await confirm({ title: "Resetar periodização", description: "Resetar todas as 4 semanas e overrides para o padrão?", destructive: true, confirmLabel: "Resetar" }))) return;
    const fresh = PeriodizationSchema.parse({ enabled: p.enabled });
    setPayload({ ...payload, periodization: fresh });
    toast.success("Periodização restaurada ao padrão");
  }

  return (
    <Card className="bg-card/60 border-border p-4">
      {p.enabled && collapsed ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Periodização ativa — {p.weeks.length} semanas
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {p.weeks.map((w, i) => `S${i + 1}: ${w.sets || "?"}×${w.reps || "?"}`).join(" · ")}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-primary flex items-center gap-1 shrink-0">
            <ChevronDown className="w-3.5 h-3.5" /> Expandir
          </span>
        </button>
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Periodização (4 semanas)</Label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p.enabled && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetAllToDefault}>
              <RefreshCcw className="w-3 h-3 mr-1" /> Resetar tudo
            </Button>
          )}
          <div className="flex items-center gap-2 pl-2 border-l border-border/40">
            <Switch
              id="periodization-enabled"
              checked={p.enabled}
              onCheckedChange={(v) => setPayload({ ...payload, periodization: { ...p, enabled: v } })}
            />
            <Label htmlFor="periodization-enabled" className="text-xs cursor-pointer">
              {p.enabled ? "Ativada" : "Desativada"}
            </Label>
          </div>
        </div>
      </div>
      {p.enabled && (
        <div className="flex justify-end mb-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleCollapsed}>
            <Minimize2 className="w-3 h-3 mr-1" /> Minimizar periodização
          </Button>
        </div>
      )}

      {p.enabled && (
        <>
          <p className="text-[11px] text-muted-foreground mb-3">
            O aluno verá as 4 semanas. Os exercícios da aba Treino servem de base e podem ser
            substituídos por semana abaixo.
          </p>

          {!validation.ok && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 mb-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-[11px] text-destructive">
                {validation.weekErrors.length + validation.overrideErrors.length} erro(s) na periodização.
                Corrija antes de salvar.
              </div>
            </div>
          )}

          {/* Avisos de recuperação muscular */}
          {(() => {
            const muscleWarnings = checkMuscleRecovery(
              (payload.workouts || []).map((w) => ({ key: w.key || "", focus: w.focus || "" }))
            );
            return muscleWarnings.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 mb-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-bold text-amber-500">Aviso de recuperação muscular</p>
                </div>
                <ul className="space-y-0.5">
                  {muscleWarnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-amber-600">{w}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {/* Editor de metadados das 4 semanas - Adicionado items-start para as colunas não esticarem se uma abrir as substituições */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 items-start">
            {p.weeks.map((w, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={w.label}
                    onChange={(e) => updateWeek(i, "label", e.target.value)}
                    className={cn("h-8 text-base md:text-sm font-bold", errorByWeek[i]?.label && "border-destructive")}
                    placeholder={`Semana ${i + 1}`}
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Prévia" onClick={() => setPreviewWeek(i)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Resetar padrão" onClick={() => resetWeekToDefault(i)}>
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {errorByWeek[i]?.label && (
                  <p className="text-[10px] text-destructive">{errorByWeek[i].label}</p>
                )}

                <div className="flex items-center gap-2">
                  <Copy className="w-3 h-3 text-muted-foreground" />
                  <Select onValueChange={(v) => duplicateWeek(Number(v), i)}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Copiar de outra semana…" />
                    </SelectTrigger>
                    <SelectContent>
                      {p.weeks.map((_, k) =>
                        k === i ? null : (
                          <SelectItem key={k} value={String(k)} className="text-xs">
                            Copiar Semana {k + 1}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(["sets", "reps", "rest", "cadence"] as const).map((f) => (
                    <div key={f}>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        {f === "sets" ? "Séries" : f === "reps" ? "Reps" : f === "rest" ? "Descanso" : "Cadência"}
                      </Label>
                      <Input
                        value={w[f]}
                        onChange={(e) => updateWeek(i, f, e.target.value)}
                        className={cn("h-8 text-base md:text-sm mt-1", errorByWeek[i]?.[f] && "border-destructive")}
                      />
                      {errorByWeek[i]?.[f] && (
                        <p className="text-[10px] text-destructive mt-0.5">{errorByWeek[i][f]}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Botão de Toggle das Substituições */}
                <div className="pt-2">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full flex items-center justify-between h-8 text-xs bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleWeekExpansion(i)}
                  >
                    <span className="flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3 h-3" /> 
                      Substituições Específicas
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expandedWeeks[i] && "rotate-180")} />
                  </Button>
                </div>

                {/* Área Expansível de Substituições (Substitui o antigo Accordion do final) */}
                {expandedWeeks[i] && (
                  <div className="pt-3 space-y-3 border-t border-border/40 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="flex items-center justify-between -mt-1 mb-1">
                      <span className="text-[10px] text-muted-foreground italic">Preencha apenas o que muda nesta semana.</span>
                      <BulkApplyPopover
                        onApply={(field, value) => bulkApplyWeek(i, field, value)}
                        weekLabel={w.label || `Semana ${i + 1}`}
                      />
                    </div>
                    {payload.workouts.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic">Nenhum exercício na aba Treino ainda.</p>
                    )}
                    {payload.workouts.map((day) => (
                      <div key={day.key} className="rounded-md border border-border/40 bg-background/40 p-2">
                        <p className="text-[11px] font-bold uppercase text-primary mb-2">Treino {day.key}</p>
                        <div className="space-y-3">
                          {(day.exercises || []).map((ex, ei) => {
                            const id = exId(day.key, ei);
                            const ov = (p.overrides?.[String(i)]?.[id]) || {};
                            const ovErr = (f: string) => overrideErrSet.has(`${i}|${id}|${f}`);
                            return (
                              <OverrideRow
                                key={`${id}-${JSON.stringify(ov)}`}
                                baseName={ex.name}
                                override={ov}
                                hasError={ovErr}
                                onApply={(patch) => {
                                  setOverride(i, id, patch);
                                  toast.success(`Alterações aplicadas na Semana ${i + 1}`);
                                }}
                              />
                            );
                          })}

                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Templates de treino (sistema + salvos) vivem no diálogo compartilhado do Protocolo */}
      {onOpenTemplateLibrary && (
        <div className="flex justify-end mt-3 pt-3 border-t border-border/40">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onOpenTemplateLibrary}>
            <Library className="w-3.5 h-3.5 mr-1.5" /> Templates de treino
          </Button>
        </div>
      )}

      <WeekPreviewDialog
        open={previewWeek !== null}
        onOpenChange={(v) => !v && setPreviewWeek(null)}
        payload={payload}
        weekIndex={previewWeek}
      />
      </>
      )}
    </Card>
  );
}

// ─── Popover de aplicação em massa por semana ───
function BulkApplyPopover({
  onApply,
  weekLabel,
}: {
  onApply: (field: "sets" | "reps" | "cadence" | "rest", value: string) => void;
  weekLabel: string;
}) {
  const [field, setField] = useState<"sets" | "reps" | "cadence" | "rest">("reps");
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const fieldLabel = { sets: "Séries", reps: "Reps", cadence: "Cadência", rest: "Descanso" } as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-primary bg-primary/5 hover:bg-primary/15">
          <Wand2 className="w-3 h-3 mr-1" /> Aplicar em massa
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 max-w-[calc(100vw-1rem)] p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Aplicar em toda a {weekLabel}
        </p>
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(fieldLabel) as Array<keyof typeof fieldLabel>).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setField(k)}
              className={cn(
                "text-[10px] font-bold px-2 py-1 rounded border transition",
                field === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {fieldLabel[k]}
            </button>
          ))}
        </div>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field === "reps" ? "Ex: 8-12" : field === "rest" ? "Ex: 60s" : ""}
          className="h-8 text-base md:text-sm"
        />
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => {
            onApply(field, value);
            setValue("");
            setOpen(false);
          }}
          disabled={!value.trim()}
        >
          Aplicar em todos os exercícios
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Linha de substituição específica (item a item) da periodização.
 * Edita em rascunho local; nada é gravado no payload até o coach clicar
 * em "Aplicar". Campo em branco = herda o valor da semana (sem override).
 */
function OverrideRow({
  baseName,
  override,
  hasError,
  onApply,
}: {
  baseName?: string;
  override: Record<string, string | undefined>;
  hasError: (f: string) => boolean;
  onApply: (patch: Record<string, string>) => void;
}) {
  const initial = {
    name: override.name ?? "",
    sets: override.sets ?? "",
    reps: override.reps ?? "",
    cadence: override.cadence ?? "",
    rest: override.rest ?? "",
  };
  const [draft, setDraft] = useState(initial);
  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some(
    (k) => (draft[k] || "") !== (initial[k] || ""),
  );
  const set = (k: keyof typeof initial, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="flex flex-col gap-1.5 pb-3 border-b border-border/20 last:border-0 last:pb-0">
      <Input
        value={draft.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder={`= ${baseName || "(exercício base)"}`}
        className="h-7 text-xs font-medium bg-muted/20"
      />
      <div className="grid grid-cols-4 gap-1.5">
        <Input value={draft.sets}    onChange={(e) => set("sets", e.target.value)}    placeholder="séries"   className={cn("h-7 text-xs", hasError("sets") && "border-destructive")} />
        <Input value={draft.reps}    onChange={(e) => set("reps", e.target.value)}    placeholder="reps"     className={cn("h-7 text-xs", hasError("reps") && "border-destructive")} />
        <Input value={draft.cadence} onChange={(e) => set("cadence", e.target.value)} placeholder="cadência" className={cn("h-7 text-xs", hasError("cadence") && "border-destructive")} />
        <Input value={draft.rest}    onChange={(e) => set("rest", e.target.value)}    placeholder="descanso" className={cn("h-7 text-xs", hasError("rest") && "border-destructive")} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground italic">
          {dirty ? "Alterações não aplicadas" : "Campos em branco seguem a semana"}
        </span>
        <div className="flex items-center gap-1">
          {dirty && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setDraft(initial)}>
              Cancelar
            </Button>
          )}
          <Button
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={!dirty}
            onClick={() => onApply({ ...draft })}
          >
            <Check className="w-3 h-3 mr-1" /> Aplicar
          </Button>
        </div>
      </div>
    </div>
  );
}
