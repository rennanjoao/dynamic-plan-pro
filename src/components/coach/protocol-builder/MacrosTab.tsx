import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, SplitSquareHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ProtocolPayload, WEEKDAYS } from "@/lib/protocolSchema";
import { normalizeCarb, cycleCarb, CARB_LABEL, CARB_COLOR, type CarbLevel } from "@/lib/weekCycle";
import { calcDayMacros, scaleOptionForMacroDelta, type OptionKind } from "@/lib/macroCalc";

/**
 * MacrosTab — extraído de ProtocolBuilder.tsx sem mudança de comportamento.
 * Mantém exatamente a mesma lógica de auto-cálculo de calorias e ciclo de carbo.
 *
 * Resumo do ciclo (carbo/kcal por tipo de dia + média semanal): puramente
 * derivado de `payload` a cada render — muda sozinho junto com o %/tipo de
 * dia, sem precisar de estado ou efeito próprio.
 */
const CARB_LEVELS: CarbLevel[] = ["high", "base", "off"];

export function MacrosTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const m = payload.macros;
  const [dayListOpen, setDayListOpen] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);

  // Compara a meta de macro (painel) com o que já está de fato montado nas
  // refeições (soma da Opção 1 de cada kind, igual ao cálculo do dia na aba
  // Dieta). A diferença é o que dá pra redistribuir pelas refeições sem
  // trocar alimento nenhum — só ajustando gramagem.
  const dayMacros = useMemo(() => calcDayMacros(payload.meals), [payload.meals]);
  const macroDeltas = {
    carbs: m.carbs - dayMacros.carbs,
    protein: m.protein - dayMacros.protein,
    fat: m.fat - dayMacros.fat,
  };
  const hasMacroDelta =
    Math.abs(macroDeltas.carbs) >= 1 || Math.abs(macroDeltas.protein) >= 1 || Math.abs(macroDeltas.fat) >= 1;
  const upd = (k: keyof typeof m, v: number | string) => {
    const next = { ...m, [k]: v } as typeof m;
    // Recalcula calorias automaticamente ao alterar macros
    if (k === "protein" || k === "carbs" || k === "fat") {
      const p = k === "protein" ? Number(v) : next.protein;
      const c = k === "carbs"   ? Number(v) : next.carbs;
      const f = k === "fat"     ? Number(v) : next.fat;
      next.calories = Math.round(p * 4 + c * 4 + f * 9);
    }
    setPayload({ ...payload, macros: next });
  };

  const highPct = payload.carbCycleHighPct ?? 15;
  const lowPct = payload.carbCycleLowPct ?? 15;
  const carbForLevel = (lvl: CarbLevel) =>
    lvl === "high" ? m.carbs * (1 + highPct / 100) : lvl === "off" ? m.carbs * (1 - lowPct / 100) : m.carbs;
  const kcalForLevel = (lvl: CarbLevel) => Math.round(m.calories + (carbForLevel(lvl) - m.carbs) * 4);

  const dayCounts: Record<CarbLevel, number> = { high: 0, base: 0, off: 0 };
  WEEKDAYS.forEach((d) => { dayCounts[normalizeCarb(payload.carbCycle?.[d.key])]++; });

  const weeklyAvgKcal = Math.round(
    CARB_LEVELS.reduce((sum, lvl) => sum + dayCounts[lvl] * kcalForLevel(lvl), 0) / 7,
  );

  return (
    <Card className="bg-card/60 border-border p-4">
      <p className="text-xs text-muted-foreground mb-3">Base calórica e macros. Servem de referência para ciclo de carbo.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div><Label className="text-xs">Calorias <span className="text-[9px] text-muted-foreground">(auto)</span></Label><Input type="number" value={m.calories} onChange={(e) => upd("calories", Number(e.target.value) || 0)} className="mt-1 h-9 text-sm" /></div>
        <div><Label className="text-xs">Proteína (g)</Label><Input type="number" value={m.protein} onChange={(e) => upd("protein", Number(e.target.value) || 0)} className="mt-1 h-9 text-sm" /></div>
        <div><Label className="text-xs">Carbo (g)</Label><Input type="number" value={m.carbs} onChange={(e) => upd("carbs", Number(e.target.value) || 0)} className="mt-1 h-9 text-sm" /></div>
        <div><Label className="text-xs">Gordura (g)</Label><Input type="number" value={m.fat} onChange={(e) => upd("fat", Number(e.target.value) || 0)} className="mt-1 h-9 text-sm" /></div>
        <div><Label className="text-xs">Água (L)</Label><Input type="number" step="0.1" value={m.water} onChange={(e) => upd("water", Number(e.target.value) || 0)} className="mt-1 h-9 text-sm" /></div>
        <div>
          <Label className="text-xs">Objetivo</Label>
          <Select value={m.goal} onValueChange={(v) => upd("goal", v)}>
            <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hipertrofia">Hipertrofia</SelectItem>
              <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
              <SelectItem value="recomposicao">Recomposição</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
              <SelectItem value="manter">Manutenção</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {payload.meals.length > 0 && (
        <div className="border-t border-border/40 pt-3 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <Label className="text-xs font-semibold">Meta vs. dieta montada</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Comparado com a Opção 1 de cada refeição.</p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                <MacroDeltaBadge label="Carbo" value={macroDeltas.carbs} />
                <MacroDeltaBadge label="Prot" value={macroDeltas.protein} />
                <MacroDeltaBadge label="Gord" value={macroDeltas.fat} />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!hasMacroDelta}
              onClick={() => setDistributeOpen(true)}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5 mr-1.5" /> Distribuir diferença pelas refeições
            </Button>
          </div>
        </div>
      )}

      <DistributeMacroDialog
        open={distributeOpen}
        onOpenChange={setDistributeOpen}
        payload={payload}
        setPayload={setPayload}
        deltas={macroDeltas}
      />

      <div className="border-t border-border/40 pt-3 mt-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold">Ciclo de Carboidratos</Label>
          <Switch checked={payload.setup.carbCycle} onCheckedChange={(v) => setPayload({ ...payload, setup: { ...payload.setup, carbCycle: v }, carbCycle: v ? Object.fromEntries(WEEKDAYS.map((d) => [d.key, "base"])) : {} })} />
        </div>
        {payload.setup.carbCycle && (
          <div className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-3 mt-2">
            <p className="text-[11px] text-muted-foreground">Variação percentual de carboidratos aplicada automaticamente nos dias de ciclo.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-emerald-500">Dia Alto — + %</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="number" min={1} max={100} value={payload.carbCycleHighPct ?? 15} onChange={(e) => setPayload({ ...payload, carbCycleHighPct: Number(e.target.value) || 15 })} className="h-8 text-xs w-20" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">× {(1 + (payload.carbCycleHighPct ?? 15) / 100).toFixed(2)}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-amber-500">Dia Off/Baixo — − %</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="number" min={1} max={100} value={payload.carbCycleLowPct ?? 15} onChange={(e) => setPayload({ ...payload, carbCycleLowPct: Number(e.target.value) || 15 })} className="h-8 text-xs w-20" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">× {(1 - (payload.carbCycleLowPct ?? 15) / 100).toFixed(2)}</p>
              </div>
            </div>

            {/* Resumo por tipo de dia — carbo(g) e kcal, mais quantos dias de cada,
                tudo recalculado a cada render a partir do payload atual. */}
            <div className="border-t border-border/40 pt-3">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Resumo por dia</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {CARB_LEVELS.map((lvl) => (
                  <div key={lvl} className={`rounded-lg border p-2 ${CARB_COLOR[lvl].bg} ${CARB_COLOR[lvl].border}`}>
                    <p className={`text-[9px] font-bold uppercase tracking-wide ${CARB_COLOR[lvl].text}`}>{CARB_LABEL[lvl]}</p>
                    <p className="text-sm font-bold text-foreground mt-0.5 leading-tight">
                      {Math.round(carbForLevel(lvl))}<span className="text-[9px] font-normal text-muted-foreground">g carbo</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{kcalForLevel(lvl)} kcal</p>
                    <p className="text-[9px] text-muted-foreground mt-1">{dayCounts[lvl]} {dayCounts[lvl] === 1 ? "dia" : "dias"}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-2 rounded-lg border border-border/40 bg-card/60 px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">Média semanal (7 dias)</span>
                <span className="text-xs font-bold text-foreground">{weeklyAvgKcal} kcal/dia</span>
              </div>
            </div>

            <Collapsible open={dayListOpen} onOpenChange={setDayListOpen} className="border-t border-border/40 pt-3">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center justify-between w-full text-left">
                  <span>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Tipo de cada dia</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {dayCounts.high} Alto · {dayCounts.base} Base · {dayCounts.off} Baixo — toque para {dayListOpen ? "recolher" : "editar dia a dia"}
                    </p>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${dayListOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 mt-2">
                {WEEKDAYS.map((d) => {
                  const cur = normalizeCarb(payload.carbCycle?.[d.key]);
                  return (
                    <div key={d.key} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-medium text-foreground shrink-0">{d.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPayload({
                            ...payload,
                            carbCycle: { ...(payload.carbCycle || {}), [d.key]: cycleCarb(cur) },
                          })
                        }
                        className={`flex-1 h-7 rounded-md border text-[11px] font-bold transition-colors ${CARB_COLOR[cur].bg} ${CARB_COLOR[cur].border} ${CARB_COLOR[cur].text}`}
                      >
                        {CARB_LABEL[cur]}
                      </button>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>
    </Card>
  );
}

function MacroDeltaBadge({ label, value }: { label: string; value: number }) {
  const r = Math.round(value);
  const cls = Math.abs(r) < 1 ? "text-muted-foreground" : r > 0 ? "text-emerald-500" : "text-rose-500";
  return (
    <span>
      {label}: <b className={cls}>{r >= 0 ? "+" : ""}{r}g</b>
    </span>
  );
}

const KIND_MACRO_LABEL: Record<OptionKind, string> = {
  carb: "Carboidrato",
  protein: "Proteína",
  fat: "Gordura",
};
const KIND_MACRO_KEY: Record<OptionKind, "carbs" | "protein" | "fat"> = {
  carb: "carbs",
  protein: "protein",
  fat: "fat",
};

/**
 * Dialog "Distribuir diferença pelas refeições".
 *
 * Deixa o coach escolher qual macro redistribuir (dentre os que têm
 * diferença entre meta e dieta montada) e qual % da diferença vai pra cada
 * refeição. Ao aplicar, ajusta a gramagem dos alimentos já lançados na
 * Opção 1 (a que conta pro total do dia) de cada refeição selecionada,
 * preservando a proporção entre eles — sem trocar nenhum alimento.
 */
function DistributeMacroDialog({
  open, onOpenChange, payload, setPayload, deltas,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  deltas: Record<"carbs" | "protein" | "fat", number>;
}) {
  const kinds = (["carb", "protein", "fat"] as OptionKind[]).filter(
    (k) => Math.abs(deltas[KIND_MACRO_KEY[k]]) >= 1
  );
  const [kind, setKind] = useState<OptionKind>(kinds[0] || "carb");
  const [pcts, setPcts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!open) return;
    setPcts({});
    if (kinds.length && !kinds.includes(kind)) setKind(kinds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const macroKey = KIND_MACRO_KEY[kind];
  const deltaTotal = deltas[macroKey] || 0;
  const sumPct = Object.values(pcts).reduce((a, b) => a + (Number(b) || 0), 0);

  function apply() {
    if (Math.abs(deltaTotal) < 1 || sumPct <= 0) { onOpenChange(false); return; }

    let anyApplied = false;
    let anySkipped = false;
    const meals = payload.meals.map((meal, mealIdx) => {
      const pct = Number(pcts[mealIdx]) || 0;
      if (pct <= 0) return meal;
      const mealDelta = (deltaTotal * pct) / 100;

      const all: any[] = Array.isArray((meal as any).options) ? (meal as any).options : [];
      let firstIdx = -1;
      for (let i = 0; i < all.length; i++) { if (all[i]?.kind === kind) { firstIdx = i; break; } }
      if (firstIdx === -1) { anySkipped = true; return meal; }

      const opt = all[firstIdx];
      const res = scaleOptionForMacroDelta(opt, macroKey, mealDelta);
      if (!res.ok) { anySkipped = true; return meal; }
      anyApplied = true;

      const newItems = (opt.items as any[]).map((it: any, i: number) => {
        const found = res.items.find((r) => r.index === i);
        if (!found || !found.resolved) return it;
        return { ...it, weight: `${found.grams}g`, rawWeight: found.grams };
      });
      const newAll = [...all];
      newAll[firstIdx] = { ...opt, items: newItems };
      return { ...meal, options: newAll } as typeof meal;
    });

    setPayload({ ...payload, meals });
    if (anyApplied) toast.success("Gramagens redistribuídas conforme os percentuais.");
    if (anySkipped) toast.warning("Alguma(s) refeição(ões) não puderam ser ajustadas automaticamente (sem alimento reconhecido na Opção 1).");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribuir diferença pelas refeições</DialogTitle>
          <DialogDescription className="text-xs">
            Ajusta a gramagem dos alimentos já lançados na Opção 1 de cada refeição escolhida, mantendo a proporção entre eles — sem trocar alimento.
          </DialogDescription>
        </DialogHeader>

        {kinds.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-6 text-center">A meta já bate com a dieta montada.</p>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Macro</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as OptionKind)}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_MACRO_LABEL[k]} ({deltas[KIND_MACRO_KEY[k]] >= 0 ? "+" : ""}{Math.round(deltas[KIND_MACRO_KEY[k]])}g)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Diferença a distribuir:{" "}
                <span className={`font-bold ${deltaTotal >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {deltaTotal >= 0 ? "+" : ""}{Math.round(deltaTotal)}g
                </span>
              </p>
            </div>

            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {payload.meals.map((meal, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs flex-1 truncate">{(meal as any).name || `Refeição ${i + 1}`}</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={pcts[i] ?? ""}
                    onChange={(e) => setPcts((p) => ({ ...p, [i]: Number(e.target.value) || 0 }))}
                    className="h-8 w-20 text-xs"
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground w-4">%</span>
                </div>
              ))}
            </div>

            <div className={`text-[11px] ${Math.round(sumPct) === 100 ? "text-emerald-500" : "text-amber-500"}`}>
              Total: {Math.round(sumPct)}%{Math.round(sumPct) !== 100 ? " — some 100% para usar toda a diferença" : ""}
            </div>

            <Button onClick={apply} disabled={sumPct <= 0} className="w-full">Aplicar distribuição</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default MacrosTab;
