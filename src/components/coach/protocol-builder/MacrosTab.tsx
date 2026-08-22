import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { ProtocolPayload, WEEKDAYS } from "@/lib/protocolSchema";
import { normalizeCarb, cycleCarb, CARB_LABEL, CARB_COLOR, type CarbLevel } from "@/lib/weekCycle";

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

export default MacrosTab;
