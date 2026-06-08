/**
 * ProtocolBuilder.tsx — Master Protocol Builder (Fase 2).
 *
 * CORREÇÕES APLICADAS:
 * [BUG CRÍTICO] TACO_DATA era undefined → crash na aba Dieta
 *   Fix: importa TACO_FOODS (nome real exportado) e cria alias TACO_DATA com campo id
 * [BUG] updItem injetava HTML nos dados salvos (spans de peso cru/pronto)
 *   Fix: armazena dados limpos; o viewer calcula o display dinamicamente
 * [LAYOUT] Aba Dieta refatorada: Carbo / Proteína / Gordura cada um com seção
 *   colorida, opções empilhadas, peso inline na mesma linha do alimento
 * [BUG] Botões Dia Alto/Baixo na aba Semana não respondiam ao clique
 *   Fix: botões agora usam data-active + classes CSS corretas, sem Select
 * [FEATURE] addOption: permite adicionar 3ª opção por macro
 * [FEATURE] Observação por opção (campo notes inline)
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { lazy, Suspense } from "react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Loader2, Save, Plus, Trash2, FileText, Dumbbell, UtensilsCrossed,
  Calendar, Sparkles, BarChart3, Activity, Pill, TrendingUp, TrendingDown, Minus,
  Check, ChevronsUpDown, ChevronDown, Copy, BookmarkPlus, Library, ArrowLeftRight, Pencil, ClipboardList
} from "lucide-react";
import { toast } from "sonner";
import {
  ProtocolPayloadSchema, ProtocolPayload, SPLIT_OPTIONS, WEEKDAYS,
  buildBasePayload, makeEmptyExercise, makeEmptyMeal, type SplitValue, MEAL_NAME_PRESETS,
} from "@/lib/protocolSchema";
import ProtocolImportExport from "./ProtocolImportExport";
import { calcMealMacros, calcDayMacros, suggestTacoSubstitutes, tacoGroupToKind } from "@/lib/macroCalc";
import { Progress } from "@/components/ui/progress";

// FIX: importa o array correto (TACO_FOODS) e adiciona campo `id` virtual
import { TACO_FOODS } from "@/data/tacoFoods";
const TACO_DATA = TACO_FOODS.map((t, i) => ({ ...t, id: String(i), cookFactor: t.cookFactor ?? 1 }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface Props {
  studentId: string;
  studentName: string;
}

const AnamnesisViewerLazy = lazy(() => import("@/components/anamnesis/AnamnesisViewer"));

interface ProtocolRow {
  id: string;
  student_id: string;
  coach_id: string | null;
  name: string;
  is_template: boolean;
  payload: ProtocolPayload;
  active: boolean | null;
  updated_at: string;
}

export default function ProtocolBuilder({ studentId, studentName }: Props) {
  const qc = useQueryClient();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [payload, setPayload] = useState<ProtocolPayload | null>(null);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSplit, setSetupSplit] = useState<SplitValue>("ABC");
  const [setupMeals, setSetupMeals] = useState(5);
  const [setupCarbCycle, setSetupCarbCycle] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCoachId(data.session?.user?.id ?? null));
  }, []);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["protocol-builder", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("protocols")
        .select("*")
        .eq("student_id", studentId)
        .eq("is_template", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ProtocolRow | null) ?? null;
    },
  });

  useEffect(() => {
    if (existing) {
      setProtocolId(existing.id);
      setName(existing.name || `Protocolo — ${studentName}`);
      setActive(existing.active ?? true);
      const parsed = ProtocolPayloadSchema.safeParse(existing.payload);
      setPayload(parsed.success ? parsed.data : buildBasePayload({ split: "ABC", mealsCount: 5, carbCycle: false }));
    } else if (!isLoading && existing === null) {
      setSetupOpen(true);
    }
  }, [existing, isLoading, studentName]);

  const isEditMode = !!protocolId;

  function generateBase() {
    const base = buildBasePayload({ split: setupSplit, mealsCount: setupMeals, carbCycle: setupCarbCycle });
    setPayload(base);
    setName(`Protocolo — ${studentName}`);
    setActive(true);
    setProtocolId(null);
    setSetupOpen(false);
  }

  async function save() {
    if (!payload) return;
    if (!name.trim()) { toast.error("Dê um nome ao protocolo"); return; }
    setSaving(true);
    try {
      const parsed = ProtocolPayloadSchema.parse(payload);
      if (isEditMode && protocolId) {
        const { error } = await sb.from("protocols").update({ name, payload: parsed, active, updated_at: new Date().toISOString() }).eq("id", protocolId);
        if (error) throw error;
        toast.success("Protocolo atualizado");
      } else {
        const { data, error } = await sb.from("protocols").insert({ student_id: studentId, coach_id: coachId, name, is_template: false, payload: parsed, active }).select().single();
        if (error) throw error;
        setProtocolId(data.id);
        toast.success("Protocolo criado");
      }
      if (coachId) {
        try {
          const goalMap: Record<string, string> = { hipertrofia: "hipertrofia", emagrecimento: "emagrecer", emagrecer: "emagrecer", recomposicao: "recomposicao", performance: "manter", manter: "manter" };
          const safeGoal = goalMap[(parsed.macros?.goal ?? "manter").toLowerCase()] ?? "manter";
          const { error: planError } = await sb.from("coach_plans").upsert({ student_id: studentId, coach_id: coachId, diet_strategy_json: parsed, workout_periodization_json: parsed, base_calories: parsed.macros?.calories ?? 2200, base_protein_g: parsed.macros?.protein ?? 160, base_carbs_g: parsed.macros?.carbs ?? 250, base_fat_g: parsed.macros?.fat ?? 55, calories: parsed.macros?.calories ?? 2200, protein_g: parsed.macros?.protein ?? 160, carbs_g: parsed.macros?.carbs ?? 250, fat_g: parsed.macros?.fat ?? 55, water_l: parsed.macros?.water ?? 2.5, goal: safeGoal, updated_at: new Date().toISOString() }, { onConflict: "coach_id,student_id" });
          if (planError) toast.error("Protocolo salvo, mas sincronização com aluno falhou", { description: planError.message, duration: 9000 });
          else toast.success("Dieta e Treino sincronizados com o aluno");
        } catch (syncErr) { console.error(syncErr); }
      }
      qc.invalidateQueries({ queryKey: ["protocol-builder", studentId] });
      qc.invalidateQueries({ queryKey: ["protocol", studentId] });
      qc.invalidateQueries({ queryKey: ["diet-strategy", studentId] });
      qc.invalidateQueries({ queryKey: ["workout-plan", studentId] });
      qc.invalidateQueries({ queryKey: ["coach-plan-presence", studentId] });
      qc.invalidateQueries({ queryKey: ["plan-macros", studentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-border p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold uppercase">{studentName.slice(0, 2)}</div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Aluno</p>
              <p className="text-sm font-semibold text-foreground truncate">{studentName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${isEditMode ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
              {isEditMode ? "Modo Edição" : "Novo Protocolo"}
            </span>
            <ProtocolImportExport payload={payload} studentName={studentName} onImport={(p) => { setPayload(p); setProtocolId(protocolId); }} />
            <Button variant="outline" size="sm" onClick={() => setConsultOpen(true)}>
              <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Consultar Anamnese
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Recriar Base</Button>
          </div>
        </div>
      </Card>

      {!payload ? (
        <Card className="bg-card/60 border-border p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-4">Configure a base do protocolo.</p>
          <Button onClick={() => setSetupOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Gerar Base</Button>
        </Card>
      ) : (
        <>
          <Card className="bg-card/60 border-border p-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <Label className="text-xs">Nome do protocolo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch checked={active} onCheckedChange={setActive} id="active" />
                <Label htmlFor="active" className="text-xs cursor-pointer">Ativo</Label>
              </div>
            </div>
          </Card>

          <Tabs defaultValue="macros">
            <TabsList className="flex w-full overflow-x-auto gap-0 h-auto p-1">
              <TabsTrigger value="macros" className="shrink-0"><BarChart3 className="w-3.5 h-3.5 mr-1" />Macros</TabsTrigger>
              <TabsTrigger value="guidelines" className="shrink-0"><FileText className="w-3.5 h-3.5 mr-1" />Diretrizes</TabsTrigger>
              <TabsTrigger value="workouts" className="shrink-0"><Dumbbell className="w-3.5 h-3.5 mr-1" />Treino</TabsTrigger>
              <TabsTrigger value="diet" className="shrink-0"><UtensilsCrossed className="w-3.5 h-3.5 mr-1" />Dieta</TabsTrigger>
              <TabsTrigger value="cycle" className="shrink-0"><Calendar className="w-3.5 h-3.5 mr-1" />Semana</TabsTrigger>
            </TabsList>
            <TabsContent value="macros" className="mt-4"><MacrosTab payload={payload} setPayload={setPayload} /></TabsContent>
            <TabsContent value="guidelines" className="mt-4"><GuidelinesTab payload={payload} setPayload={setPayload} /></TabsContent>
            <TabsContent value="workouts" className="mt-4"><WorkoutsTab payload={payload} setPayload={setPayload} /></TabsContent>
            <TabsContent value="diet" className="mt-4"><DietTab payload={payload} setPayload={setPayload} /></TabsContent>
            <TabsContent value="cycle" className="mt-4"><WeekCycleTab payload={payload} setPayload={setPayload} /></TabsContent>
          </Tabs>

          <div className="flex justify-end sticky bottom-4">
            <Button onClick={save} disabled={saving} size="lg" className="shadow-lg">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {isEditMode ? "Atualizar Protocolo" : "Criar Protocolo"}
            </Button>
          </div>
        </>
      )}

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Setup do Protocolo</DialogTitle>
            <DialogDescription className="text-xs">Define a estrutura base. Você poderá editar tudo depois.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Divisão do treino</Label>
              <Select value={setupSplit} onValueChange={(v) => setSetupSplit(v as SplitValue)}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SPLIT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value} className="text-sm">{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quantidade de refeições</Label>
              <Select value={String(setupMeals)} onValueChange={(v) => setSetupMeals(Number(v))}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{[3,4,5,6,7,8].map((n) => <SelectItem key={n} value={String(n)} className="text-sm">{n} refeições</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm">Ciclo de carboidratos</Label>
                <p className="text-[11px] text-muted-foreground">Dias alto/baixo na semana</p>
              </div>
              <Switch checked={setupCarbCycle} onCheckedChange={setSetupCarbCycle} />
            </div>
            <Button onClick={generateBase} className="w-full"><Sparkles className="w-4 h-4 mr-2" /> Gerar Base</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sheet lateral: Consultar Anamnese / Feedback sem desmontar o builder */}
      <Sheet open={consultOpen} onOpenChange={setConsultOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Anamnese & Feedback — {studentName}</SheetTitle>
            <SheetDescription className="text-xs">Consulte sem perder o estado da dieta. O builder permanece montado.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {consultOpen && (
              <Suspense fallback={<div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>}>
                <AnamnesisViewerLazy studentId={studentId} studentName={studentName} />
              </Suspense>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── MacrosTab ───────────────────────────────────────────────────────────────

function MacrosTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const m = payload.macros;
  const upd = (k: keyof typeof m, v: number | string) => setPayload({ ...payload, macros: { ...m, [k]: v } as typeof m });
  return (
    <Card className="bg-card/60 border-border p-4">
      <p className="text-xs text-muted-foreground mb-3">Base calórica e macros. Servem de referência para ciclo de carbo.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div><Label className="text-xs">Calorias</Label><Input type="number" value={m.calories} onChange={(e) => upd("calories", Number(e.target.value) || 0)} className="mt-1 h-9 text-sm" /></div>
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
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── GuidelinesTab ────────────────────────────────────────────────────────────

function GuidelinesTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const upd = (k: keyof ProtocolPayload["guidelines"], v: string) => setPayload({ ...payload, guidelines: { ...payload.guidelines, [k]: v } });
  return (
    <Card className="bg-card/60 border-border p-4 space-y-4">
      <Field label="Diretrizes de treino" hint="Regras gerais (foco, intensidade, falha, descanso)">
        <Textarea value={payload.guidelines.training} onChange={(e) => upd("training", e.target.value)} className="min-h-[100px] text-sm" />
      </Field>
      <Field label="Diretrizes da dieta" hint="Hidratação, sal, fibras, suplementos com refeições">
        <Textarea value={payload.guidelines.diet} onChange={(e) => upd("diet", e.target.value)} className="min-h-[100px] text-sm" />
      </Field>
      <Field label="Organização da semana" hint="Ex.: Seg/Qua/Sex carbo alto · Ter/Qui/Sab/Dom carbo baixo">
        <Textarea value={payload.guidelines.weekOrganization} onChange={(e) => upd("weekOrganization", e.target.value)} className="min-h-[80px] text-sm" />
      </Field>
      <Field label="Suplementação — obs. gerais">
        <Textarea value={payload.guidelines.supplementation} onChange={(e) => upd("supplementation", e.target.value)} className="min-h-[100px] text-sm" />
      </Field>
      <div className="border-t border-border/40 pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold flex items-center gap-2"><Pill className="w-4 h-4 text-primary" /> Suplementos</Label>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPayload({ ...payload, supplements: [...(payload.supplements ?? []), { name: "", dose: "", timing: "", notes: "" }] })}><Plus className="w-3 h-3 mr-1" /> Suplemento</Button>
        </div>
        {(payload.supplements ?? []).length === 0 && <p className="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border/40 rounded-lg">Nenhum suplemento cadastrado.</p>}
        {(payload.supplements ?? []).map((s, si) => (
          <Card key={si} className="bg-card/60 border-border p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <Input value={s.name} onChange={(e) => { const n = [...(payload.supplements ?? [])]; n[si] = { ...n[si], name: e.target.value }; setPayload({ ...payload, supplements: n }); }} placeholder="Nome" className="h-8 text-xs" />
              <button onClick={() => setPayload({ ...payload, supplements: (payload.supplements ?? []).filter((_, j) => j !== si) })} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={s.dose} onChange={(e) => { const n = [...(payload.supplements ?? [])]; n[si] = { ...n[si], dose: e.target.value }; setPayload({ ...payload, supplements: n }); }} placeholder="Dose" className="h-8 text-xs" />
              <Select value={s.timing || "Outro"} onValueChange={(v) => { const n = [...(payload.supplements ?? [])]; n[si] = { ...n[si], timing: v }; setPayload({ ...payload, supplements: n }); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["Ao acordar (jejum)","Pré-treino","Intra-treino","Pós-treino","Com refeição","Antes de dormir","Outro"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input value={s.notes} onChange={(e) => { const n = [...(payload.supplements ?? [])]; n[si] = { ...n[si], notes: e.target.value }; setPayload({ ...payload, supplements: n }); }} placeholder="Obs." className="h-8 text-xs mt-2" />
          </Card>
        ))}
      </div>
    </Card>
  );
}

// ─── WorkoutsTab ─────────────────────────────────────────────────────────────

function WorkoutsTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const updDay = (idx: number, patch: Partial<ProtocolPayload["workouts"][number]>) => { const n = [...payload.workouts]; n[idx] = { ...n[idx], ...patch }; setPayload({ ...payload, workouts: n }); };
  const updEx = (di: number, ei: number, patch: any) => { const n = [...payload.workouts]; const exs = [...n[di].exercises]; exs[ei] = { ...exs[ei], ...patch }; n[di] = { ...n[di], exercises: exs }; setPayload({ ...payload, workouts: n }); };
  return (
    <div className="space-y-3">
      {payload.workouts.map((day, di) => (
        <Card key={day.key} className="bg-card/60 border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">{day.key}</div>
            <Input value={day.focus} onChange={(e) => updDay(di, { focus: e.target.value })} placeholder="Foco do treino" className="h-9 text-sm flex-1" />
          </div>
          <div className="space-y-2">
            {day.exercises.map((ex, ei) => (
              <div key={ei} className="grid grid-cols-2 md:grid-cols-[1.8fr_0.6fr_0.6fr_0.6fr_0.6fr_1fr_auto] gap-2">
                <Input value={ex.name} onChange={(e) => updEx(di, ei, { name: e.target.value })} placeholder="Supino reto" className="h-8 text-xs" />
                <Input value={ex.sets} onChange={(e) => updEx(di, ei, { sets: e.target.value })} placeholder="4" className="h-8 text-xs" />
                <Input value={ex.reps} onChange={(e) => updEx(di, ei, { reps: e.target.value })} placeholder="8-10" className="h-8 text-xs" />
                <Input value={ex.cadence} onChange={(e) => updEx(di, ei, { cadence: e.target.value })} placeholder="3010" className="h-8 text-xs" />
                <Input value={ex.rest} onChange={(e) => updEx(di, ei, { rest: e.target.value })} placeholder="60s" className="h-8 text-xs" />
                <Input value={ex.notes} onChange={(e) => updEx(di, ei, { notes: e.target.value })} placeholder="—" className="h-8 text-xs" />
                <button onClick={() => updDay(di, { exercises: day.exercises.filter((_, i) => i !== ei) })} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => updDay(di, { exercises: [...day.exercises, makeEmptyExercise()] })} className="h-7 text-xs mt-1"><Plus className="w-3 h-3 mr-1" /> Exercício</Button>
          </div>
        </Card>
      ))}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Aeróbicos</Label>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPayload({ ...payload, cardio: [...(payload.cardio ?? []), { type: "", duration: "", intensity: "", workoutKey: "", associationType: "workout", notes: "" }] })}><Plus className="w-3 h-3 mr-1" /> Aeróbico</Button>
        </div>
        {(payload.cardio ?? []).length === 0 && <p className="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border/40 rounded-lg">Nenhum aeróbico cadastrado.</p>}
        {(payload.cardio ?? []).map((c, ci) => (
          <Card key={ci} className="bg-card/60 border-border p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <Select value={c.type || "Outro"} onValueChange={(v) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], type: v }; setPayload({ ...payload, cardio: n }); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>{["AEJ","LISS","HIIT","Caminhada","Bicicleta","Outro"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
              </Select>
              <button onClick={() => setPayload({ ...payload, cardio: (payload.cardio ?? []).filter((_, j) => j !== ci) })} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><Label className="text-[10px] uppercase text-muted-foreground">Duração</Label><Input value={c.duration} onChange={(e) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], duration: e.target.value }; setPayload({ ...payload, cardio: n }); }} placeholder="40 min" className="h-8 text-xs mt-1" /></div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Intensidade</Label>
                <Select value={c.intensity || "Moderada"} onValueChange={(v) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], intensity: v }; setPayload({ ...payload, cardio: n }); }}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Leve","Moderada","Alta"].map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input value={c.notes} onChange={(e) => { const n = [...(payload.cardio ?? [])]; n[ci] = { ...n[ci], notes: e.target.value }; setPayload({ ...payload, cardio: n }); }} placeholder="Observações" className="h-8 text-xs mt-2" />
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── DietTab ─────────────────────────────────────────────────────────────────
// Layout: cada refeição tem 3 seções coloridas (Carbo / Proteína / Gordura).
// Cada seção mostra suas opções (2 por padrão, até 3). Peso inline no alimento.
// Botão cru/cozido é do viewer — aqui só salvamos rawWeight + cookFactor limpos.

function DietTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const [coachId, setCoachId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setCoachId(data.session?.user?.id ?? null)); }, []);

  const [saveTplFor, setSaveTplFor] = useState<{ idx: number; name: string; kind: string } | null>(null);
  const [loadTplOpen, setLoadTplOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  async function reloadTemplates() {
    if (!coachId) return;
    const { data } = await sb.from("meal_templates").select("*").eq("coach_id", coachId).order("created_at", { ascending: false });
    setTemplates(data || []);
  }

  useEffect(() => { if (loadTplOpen) reloadTemplates(); /* eslint-disable-next-line */ }, [loadTplOpen, coachId]);

  async function persistTemplate() {
    if (!saveTplFor || !coachId) return;
    const meal = payload.meals[saveTplFor.idx];
    const { error } = await sb.from("meal_templates").insert({
      coach_id: coachId,
      name: saveTplFor.name.trim() || meal.name || "Modelo",
      kind: saveTplFor.kind || "mixed",
      meal_data: meal,
    });
    if (error) { toast.error("Falha ao salvar modelo: " + error.message); return; }
    toast.success("Modelo salvo na sua biblioteca");
    setSaveTplFor(null);
  }

  function attachTemplate(tpl: any) {
    try {
      const meal = tpl.meal_data;
      setPayload({ ...payload, meals: [...payload.meals, { ...meal, name: meal.name || tpl.name }] });
      toast.success("Modelo adicionado");
      setLoadTplOpen(false);
    } catch { toast.error("Modelo inválido"); }
  }

  function duplicateMeal(mealIdx: number) {
    const orig = payload.meals[mealIdx];
    const copy = JSON.parse(JSON.stringify(orig));
    copy.name = `${orig.name || "Refeição"} (cópia)`;
    const next = [...payload.meals];
    next.splice(mealIdx + 1, 0, copy);
    setPayload({ ...payload, meals: next });
  }

  // Placar de macros (sticky) — soma das primeiras opções de cada kind por refeição
  const dayMacros = useMemo(() => calcDayMacros(payload.meals), [payload.meals]);
  const goals = payload.macros;
  const bars = [
    { label: "Kcal", cur: dayMacros.kcal, goal: goals.calories || 1, color: "bg-primary" },
    { label: "Prot", cur: dayMacros.protein, goal: goals.protein || 1, color: "bg-blue-500" },
    { label: "Carb", cur: dayMacros.carbs, goal: goals.carbs || 1, color: "bg-amber-500" },
    { label: "Gord", cur: dayMacros.fat, goal: goals.fat || 1, color: "bg-rose-500" },
  ];

  const updMacro = (i: number, k: "carbs" | "protein" | "fat", v: number) => {
    const next = [...payload.meals];
    next[i] = { ...next[i], macros: { ...next[i].macros, [k]: v } };
    setPayload({ ...payload, meals: next });
  };

  function updMealField(mealIdx: number, patch: Partial<ProtocolPayload["meals"][number]>) {
    const next = [...payload.meals];
    next[mealIdx] = { ...next[mealIdx], ...patch };
    setPayload({ ...payload, meals: next });
  }

  function getOptsForKind(meal: any, kind: "carb" | "protein" | "fat") {
    const all: any[] = Array.isArray(meal.options) ? meal.options : [];
    const filtered = all.filter((o: any) => o?.kind === kind);
    while (filtered.length < 2) filtered.push({ kind, title: `Opção ${filtered.length + 1}`, notes: "", items: [{ name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false }] });
    return filtered.slice(0, 3);
  }

  function updOption(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number, patch: any) {
    const meal = payload.meals[mealIdx];
    const all = [...(meal.options as any[])];
    let seen = -1; let target = -1;
    for (let i = 0; i < all.length; i++) { if (all[i]?.kind === kind) { seen++; if (seen === optIdx) { target = i; break; } } }
    if (target === -1) all.push({ kind, title: `Opção ${optIdx + 1}`, notes: "", items: [{ name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false }], ...patch });
    else all[target] = { ...all[target], ...patch };
    updMealField(mealIdx, { options: all as any });
  }

  function addOption(mealIdx: number, kind: "carb" | "protein" | "fat") {
    const meal = payload.meals[mealIdx];
    const all = [...(meal.options as any[])];
    const count = all.filter((o: any) => o?.kind === kind).length;
    if (count >= 3) return;
    all.push({ kind, title: `Opção ${count + 1}`, notes: "", items: [{ name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false }] });
    updMealField(mealIdx, { options: all as any });
  }

  function removeOption(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number) {
    const meal = payload.meals[mealIdx];
    let seen = -1;
    const newAll = (meal.options as any[]).filter((o: any) => { if (o?.kind === kind) { seen++; if (seen === optIdx) return false; } return true; });
    updMealField(mealIdx, { options: newAll as any });
  }

  function updItem(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number, itemIdx: number, patch: any) {
    const opts = getOptsForKind(payload.meals[mealIdx], kind);
    const items = [...(opts[optIdx].items as any[])];
    items[itemIdx] = { ...items[itemIdx], ...patch };
    // FIX: dados LIMPOS — não injeta HTML. O viewer exibe rawWeight dinamicamente
    if (items[itemIdx].isTaco) {
      items[itemIdx].name = items[itemIdx].baseName || items[itemIdx].name || "";
      items[itemIdx].weight = "";
    }
    updOption(mealIdx, kind, optIdx, { items });
  }

  function addItem(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number) {
    const opts = getOptsForKind(payload.meals[mealIdx], kind);
    updOption(mealIdx, kind, optIdx, { items: [...(opts[optIdx].items as any[]), { name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false }] });
  }

  function rmItem(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number, itemIdx: number) {
    const opts = getOptsForKind(payload.meals[mealIdx], kind);
    let items = [...(opts[optIdx].items as any[])];
    if (items.length <= 1) items = [{ name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false }];
    else items.splice(itemIdx, 1);
    updOption(mealIdx, kind, optIdx, { items });
  }

  const KIND: Record<"carb" | "protein" | "fat", { label: string; color: string; bg: string; border: string }> = {
    carb:    { label: "Carbo",    color: "text-amber-600",  bg: "bg-amber-500/5",  border: "border-amber-500/20" },
    protein: { label: "Proteína", color: "text-blue-600",   bg: "bg-blue-500/5",   border: "border-blue-500/20" },
    fat:     { label: "Gordura",  color: "text-rose-500",   bg: "bg-rose-500/5",   border: "border-rose-500/20" },
  };

  return (
    <div className="space-y-3">
      {/* Placar sticky de macros */}
      <div className="sticky top-0 z-10 -mx-2 px-2 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <Card className="bg-card/80 border-border p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Macros do dia (auto) vs meta</p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLoadTplOpen(true)}>
              <Library className="w-3 h-3 mr-1" /> Carregar modelo
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {bars.map((b) => {
              const pct = Math.min(150, Math.round((b.cur / b.goal) * 100));
              const over = b.cur > b.goal;
              return (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">{b.label}</span>
                    <span className={`text-[10px] font-bold ${over ? "text-rose-500" : "text-foreground"}`}>{Math.round(b.cur)}/{Math.round(b.goal)}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                    <div className={`${over ? "bg-rose-500" : b.color} h-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {payload.meals.map((m, mealIdx) => (
        <Card key={mealIdx} className="bg-card/60 border-border overflow-hidden">
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/10">
            <Input
              list="meal-name-presets"
              value={m.name}
              onChange={(e) => updMealField(mealIdx, { name: e.target.value })}
              placeholder="Nome (Café, Almoço...)"
              className="h-8 text-sm font-bold text-primary flex-1"
            />
            <Input value={m.time} onChange={(e) => updMealField(mealIdx, { time: e.target.value })} placeholder="07:00" className="h-8 text-sm w-20 shrink-0" />
            {payload.setup.carbCycle && (
              <button type="button"
                onClick={() => updMealField(mealIdx, { carbCycle: !(m as any).carbCycle } as any)}
                className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${(m as any).carbCycle ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500" : "border-border/50 text-muted-foreground"}`}>
                <TrendingUp className="w-3.5 h-3.5" /> Ciclo
              </button>
            )}
            <button onClick={() => duplicateMeal(mealIdx)} className="text-muted-foreground hover:text-primary p-1.5 shrink-0" title="Duplicar refeição"><Copy className="w-3.5 h-3.5" /></button>
            <button onClick={() => setSaveTplFor({ idx: mealIdx, name: m.name || "Modelo", kind: "mixed" })} className="text-muted-foreground hover:text-primary p-1.5 shrink-0" title="Salvar como modelo"><BookmarkPlus className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPayload({ ...payload, meals: payload.meals.filter((_, idx) => idx !== mealIdx) })} className="text-muted-foreground hover:text-destructive p-1.5 shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>

          {/* Seções de macro */}
          <div className="p-4 space-y-3">
            {(["carb", "protein", "fat"] as const).map((kind) => {
              const cfg = KIND[kind];
              const opts = getOptsForKind(m, kind);
              return (
                <div key={kind} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`text-[11px] uppercase tracking-widest font-bold ${cfg.color}`}>{cfg.label}</span>
                    {opts.length < 3 && (
                      <button type="button" onClick={() => addOption(mealIdx, kind)} className={`text-[10px] flex items-center gap-1 ${cfg.color} opacity-60 hover:opacity-100 transition-opacity`}>
                        <Plus className="w-3 h-3" /> + opção
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {opts.map((opt: any, optIdx: number) => {
                      const items: any[] = Array.isArray(opt.items) ? opt.items : [];
                      return (
                        <div key={optIdx} className="bg-card rounded-lg border border-border/50 p-2.5">
                          {/* Header opção */}
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} border ${cfg.border}`}>Op {optIdx + 1}</span>
                            <Input value={opt.title || ""} onChange={(e) => updOption(mealIdx, kind, optIdx, { title: e.target.value })} placeholder="Título (ex: versão off-season)" className="h-6 text-[11px] flex-1 bg-transparent border-0 border-b border-dashed rounded-none px-1" />
                            {opts.length > 1 && (
                              <button type="button" onClick={() => removeOption(mealIdx, kind, optIdx)} className="text-muted-foreground hover:text-destructive p-0.5 shrink-0"><Trash2 className="w-3 h-3" /></button>
                            )}
                          </div>
                          {/* Observação da opção */}
                          <Input value={(opt as any).notes || ""} onChange={(e) => updOption(mealIdx, kind, optIdx, { notes: e.target.value })} placeholder="Observação (ex: usar nos dias de treino pesado)" className="h-6 text-[11px] w-full bg-transparent border-0 border-b border-dashed rounded-none px-1 mb-2 text-muted-foreground" />

                          {/* Alimentos */}
                          <div className="space-y-1.5">
                            {items.map((it: any, ii: number) => (
                              <div key={ii} className="bg-background rounded border border-border/40 px-2 py-2 space-y-1.5">
                                {/* Linha 1: nome do alimento */}
                                <div className="flex items-center gap-1.5">
                                  {/* Campo de texto livre — principal para alimentos não-TACO */}
                                  <Input
                                    value={it.baseName || it.name || ""}
                                    onChange={(e) => updItem(mealIdx, kind, optIdx, ii, { name: e.target.value, baseName: e.target.value, isTaco: false, rawWeight: 0 })}
                                    placeholder="Nome do alimento (ex: Ovos inteiros, Frango grelhado...)"
                                    className="h-8 text-xs flex-1"
                                  />
                                  {/* Busca TACO opcional */}
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Buscar na tabela TACO">
                                        <ChevronsUpDown className="h-3 w-3" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="end">
                                      <Command>
                                        <CommandInput placeholder="Buscar na TACO..." className="h-9 text-xs" />
                                        <CommandList>
                                          <CommandEmpty className="py-2 px-4 text-xs text-muted-foreground">Não encontrado — use o campo de nome à esquerda.</CommandEmpty>
                                          <CommandGroup heading="Tabela TACO (UNICAMP)">
                                            {TACO_DATA.map((taco) => {
                                              const tKind = tacoGroupToKind(taco.group);
                                              const badgeCls = tKind === "protein"
                                                ? "bg-blue-500/10 text-blue-600"
                                                : tKind === "fat"
                                                ? "bg-rose-500/10 text-rose-500"
                                                : "bg-amber-500/10 text-amber-600";
                                              const badgeLabel = tKind === "protein" ? "prot" : tKind === "fat" ? "gord" : "carb";
                                              return (
                                              <CommandItem key={taco.id} value={taco.name}
                                                onSelect={() => {
                                                  if (tKind !== kind) {
                                                    const kindLabel = kind === "protein" ? "Proteína" : kind === "fat" ? "Gordura" : "Carbo";
                                                    const tacoLabel = tKind === "protein" ? "Proteína" : tKind === "fat" ? "Gordura" : "Carbo";
                                                    toast.error(`"${taco.name}" é ${tacoLabel} — adicione-o no card correto.`, { description: `Este card é de ${kindLabel}.`, duration: 4000 });
                                                    return;
                                                  }
                                                  updItem(mealIdx, kind, optIdx, ii, { baseName: taco.name, name: taco.name, isTaco: true, cookFactor: taco.cookFactor, rawWeight: it.rawWeight || 100 });
                                                }}
                                                className="text-xs">
                                                <Check className={`mr-2 h-3 w-3 ${it.baseName === taco.name ? "opacity-100" : "opacity-0"}`} />
                                                <span className="flex-1">{taco.name}</span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ml-2 ${badgeCls}`}>{badgeLabel}</span>
                                                {taco.cookFactor !== 1 && <span className="ml-1 text-[9px] text-muted-foreground">fator {taco.cookFactor}</span>}
                                              </CommandItem>
                                              );
                                            })}
                                          </CommandGroup>
                                        </CommandList>
                                      </Command>
                                    </PopoverContent>
                                  </Popover>
                                  <button onClick={() => rmItem(mealIdx, kind, optIdx, ii)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                                {/* Linha 2: quantidade / peso */}
                                <div className="flex items-center gap-2">
                                  {it.isTaco ? (
                                    <>
                                      <label className="text-[10px] text-muted-foreground shrink-0">Peso (g cru)</label>
                                      <Input type="number" value={it.rawWeight || ""} onChange={(e) => updItem(mealIdx, kind, optIdx, ii, { rawWeight: Number(e.target.value) })} placeholder="ex: 100" className="h-7 text-xs w-24" />
                                      <span className="text-[10px] text-muted-foreground">g — cozido calculado automaticamente</span>
                                    </>
                                  ) : (
                                    <>
                                      <label className="text-[10px] text-muted-foreground shrink-0">Quantidade</label>
                                      <Input value={it.weight ?? ""} onChange={(e) => updItem(mealIdx, kind, optIdx, ii, { weight: e.target.value })} placeholder="ex: 8 unidades, 200g, 2 fatias..." className="h-7 text-xs flex-1" />
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => addItem(mealIdx, kind, optIdx)} className={`mt-1.5 text-[11px] flex items-center gap-1 px-1 ${cfg.color} opacity-60 hover:opacity-100`}><Plus className="w-3 h-3" /> alimento</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Macros totais */}
            <details className="rounded-lg border border-border/40 p-2">
              <summary className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground cursor-pointer select-none">Macros da refeição</summary>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div><Label className="text-[10px] uppercase text-amber-500">Carbo (g)</Label><Input type="number" value={m.macros.carbs} onChange={(e) => updMacro(mealIdx, "carbs", Number(e.target.value) || 0)} className="h-8 text-xs mt-1" /></div>
                <div><Label className="text-[10px] uppercase text-blue-500">Proteína (g)</Label><Input type="number" value={m.macros.protein} onChange={(e) => updMacro(mealIdx, "protein", Number(e.target.value) || 0)} className="h-8 text-xs mt-1" /></div>
                <div><Label className="text-[10px] uppercase text-rose-500">Gordura (g)</Label><Input type="number" value={m.macros.fat} onChange={(e) => updMacro(mealIdx, "fat", Number(e.target.value) || 0)} className="h-8 text-xs mt-1" /></div>
              </div>
            </details>
          </div>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={() => setPayload({ ...payload, meals: [...payload.meals, makeEmptyMeal(`Refeição ${payload.meals.length + 1}`)] })} className="w-full">
        <Plus className="w-4 h-4 mr-1.5" /> Adicionar Nova Refeição
      </Button>

      <datalist id="meal-name-presets">
        {MEAL_NAME_PRESETS.map((n) => <option key={n} value={n} />)}
      </datalist>

      {/* Dialog: Salvar como modelo */}
      <Dialog open={!!saveTplFor} onOpenChange={(o) => !o && setSaveTplFor(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Salvar refeição como modelo</DialogTitle>
            <DialogDescription className="text-xs">Disponível na biblioteca do coach para qualquer aluno.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Nome do modelo</Label>
              <Input value={saveTplFor?.name || ""} onChange={(e) => setSaveTplFor((p) => p ? { ...p, name: e.target.value } : null)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={saveTplFor?.kind || "mixed"} onValueChange={(v) => setSaveTplFor((p) => p ? { ...p, kind: v } : null)}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["mixed","cafe","pre","pos","almoco","lanche","jantar","ceia"].map((k) => (
                    <SelectItem key={k} value={k} className="text-sm capitalize">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={persistTemplate} className="w-full">Salvar modelo</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Carregar modelo */}
      <Dialog open={loadTplOpen} onOpenChange={setLoadTplOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Biblioteca de refeições</DialogTitle>
            <DialogDescription className="text-xs">Clique em um modelo para anexar como nova refeição.</DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">Nenhum modelo salvo ainda.</p>
          ) : (
            <div className="space-y-2 py-2">
              {templates.map((t) => {
                const mm = calcMealMacros(t.meal_data);
                return (
                  <button key={t.id} onClick={() => attachTemplate(t)}
                    className="w-full text-left bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.kind}</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span>{Math.round(mm.kcal)} kcal</span>
                      <span>· {Math.round(mm.protein)}p</span>
                      <span>· {Math.round(mm.carbs)}c</span>
                      <span>· {Math.round(mm.fat)}g</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── WeekCycleTab ─────────────────────────────────────────────────────────────

function WeekCycleTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  if (!payload.setup.carbCycle) {
    return (
      <Card className="bg-card/60 border-border p-8 text-center">
        <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Ciclo de carboidratos desativado nesse protocolo.</p>
      </Card>
    );
  }

  const upd = (day: string, v: "high" | "base" | "off") =>
    setPayload({ ...payload, carbCycle: { ...payload.carbCycle, [day]: v } });

  // FIX: botões agora funcionam — onClick direto, sem <Select>
  return (
    <Card className="bg-card/60 border-border p-4">
      <p className="text-xs text-muted-foreground mb-4">Define o tipo de dia. A dieta exibirá a gramatura correta para o aluno.</p>
      <div className="space-y-2">
        {WEEKDAYS.map((d) => {
          const raw = payload.carbCycle[d.key] ?? "base";
          const cur: "high" | "base" | "off" = raw === "low" ? "off" : (raw as "high" | "base" | "off");
          return (
            <div key={d.key} className="flex items-center gap-3">
              <div className="w-20 text-sm font-medium text-foreground shrink-0">{d.label}</div>
              <div className="flex flex-1 gap-1.5">
                {(["high", "base", "off"] as const).map((opt) => {
                  const Icon = opt === "high" ? TrendingUp : opt === "off" ? TrendingDown : Minus;
                  const label = opt === "high" ? "Alto" : opt === "off" ? "Baixo" : "Base";
                  const activeCls = cur === opt
                    ? opt === "high" ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-600 font-bold"
                      : opt === "off" ? "bg-amber-500/15 border-amber-500/50 text-amber-600 font-bold"
                      : "bg-blue-500/15 border-blue-500/50 text-blue-600 font-bold"
                    : "border-border/50 text-muted-foreground hover:border-border";
                  return (
                    <button key={opt} type="button" onClick={() => upd(d.key, opt)}
                      className={`flex-1 h-8 flex items-center justify-center gap-1 rounded-lg border text-xs transition-colors ${activeCls}`}>
                      <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-semibold">{label}</Label>
      {hint && <p className="text-[10px] text-muted-foreground mb-1">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
