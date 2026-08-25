/**
 * DietTab.tsx — aba "Dieta" do ProtocolBuilder.
 * Extraído de ProtocolBuilder.tsx sem alteração de comportamento.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Trash2, ChevronDown, Copy, BookmarkPlus, Library, UtensilsCrossed, Pill,
  ArrowUp, ArrowDown, Eye, AlertCircle, Sparkles, CheckCircle2, Loader2, TrendingUp,
  Wand2, GripVertical,
} from "lucide-react";
import { loadCoachProfile } from "@/lib/prescriptionMemory";
import {
  ProtocolPayload, makeEmptyMeal, MEAL_NAME_PRESETS, SUPPLEMENT_OBJECTIVES, genItemId,
} from "@/lib/protocolSchema";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DAY_KEYS } from "@/lib/weekCycle";
import {
  calcMealMacros, calcDayMacros, tacoGroupToKind, parseWeightString, calcItemMacros,
  optionMacros, compareOptions, suggestProportionalWeights, type SubstitutionSeverity,
} from "@/lib/macroCalc";
import { searchFoods, type FoodHit } from "@/lib/foodSearch";
import { TACO_FOODS } from "@/data/tacoFoods";

const TACO_DATA = TACO_FOODS.map((t, i) => ({ ...t, id: String(i), cookFactor: t.cookFactor ?? 1 }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

/**
 * Regra de três: quantos gramas do alimento `hit` batem as mesmas kcal do
 * alimento principal `mainItem`. Retorna 0 quando não é possível calcular
 * (item principal sem kcal ou substituto sem tabela nutricional).
 * O valor é apenas uma sugestão inicial — o coach edita livremente depois.
 */
function equivalentGramsForKcal(mainItem: any, hit: FoodHit): number {
  const mainKcal = calcItemMacros(mainItem).kcal;
  const per100 = Number((hit as any)?.kcal) || 0;
  if (!mainKcal || mainKcal <= 0 || per100 <= 0) return 0;
  const grams = Math.round((mainKcal / per100) * 100);
  return isFinite(grams) && grams > 0 ? grams : 0;
}



// ─── DietTab ─────────────────────────────────────────────────────────────────

// Card sortable para drag-and-drop de refeições. Aplica transform no próprio
// Card (mantém o layout original) e delega os listeners a um handle
// dedicado (ícone GripVertical) para não interferir nos inputs — mesmo
// padrão de SortableExerciseRow em WorkoutsTab.tsx.
function SortableMealCard({
  id, children,
}: { id: string; children: (handle: { attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}

export function DietTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const [coachId, setCoachId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => {   const id = data.session?.user?.id ?? null;   setCoachId(id);   loadCoachProfile(id); }); }, []);

  // Backfill de __id em refeições carregadas de protocolos antigos (sem esse
  // campo) — mesmo padrão do backfill de exercícios em WorkoutsTab.tsx.
  // Necessário pro drag-and-drop ter uma identidade estável por item; roda
  // uma única vez por payload, só quando alguma refeição está sem __id.
  useEffect(() => {
    const needs = payload.meals.some((m: any) => !m.__id);
    if (!needs) return;
    const nextMeals = payload.meals.map((m: any) => (m.__id ? m : { ...m, __id: genItemId("meal") }));
    setPayload({ ...payload, meals: nextMeals });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sensors: só inicia drag após 5px de movimento p/ não interferir em
  // cliques nos inputs/botões do card (mesma config de WorkoutsTab.tsx).
  const mealSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleMealDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = payload.meals.map((m: any, i) => m.__id ?? `meal-${i}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setPayload({ ...payload, meals: arrayMove(payload.meals, oldIndex, newIndex) });
  }

  const [saveTplFor, setSaveTplFor] = useState<{ idx: number; name: string; kind: string } | null>(null);
  const [loadTplOpen, setLoadTplOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [collapsedMeals, setCollapsedMeals] = useState<Record<number, boolean>>({});
  // Controla quais grupos de macros estão minimizados: key = "mealIdx:kind"
  const [collapsedKinds, setCollapsedKinds] = useState<Record<string, boolean>>({});
  const toggleKind = (mealIdx: number, kind: string) =>
    setCollapsedKinds((prev) => ({ ...prev, [`${mealIdx}:${kind}`]: !prev[`${mealIdx}:${kind}`] }));
  const isKindCollapsed = (mealIdx: number, kind: string) => !!collapsedKinds[`${mealIdx}:${kind}`];

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
      const meal = JSON.parse(JSON.stringify(tpl.meal_data ?? {}));
      // Um template anexado é uma refeição independente: não pode carregar o
      // pairId de uma versão anterior e criar um par fantasma no aluno.
      delete meal.pairId;
      meal.day_type = "all";
      meal.excludeFromDayTotal = false;
      // __id novo: o template pode já ter um __id salvo de quando foi criado
      // (ou já ter sido anexado antes) — sem isso, duas refeições da mesma
      // origem colidiriam no drag-and-drop.
      setPayload({ ...payload, meals: [...payload.meals, { ...meal, name: meal.name || tpl.name, __id: genItemId("meal") }] });
      toast.success("Modelo adicionado");
      setLoadTplOpen(false);
    } catch { toast.error("Modelo inválido"); }
  }

  function duplicateMeal(mealIdx: number) {
    const orig = payload.meals[mealIdx];
    const copy = JSON.parse(JSON.stringify(orig));
    copy.name = `${orig.name || "Refeição"} (cópia)`;
    // Duplicação comum cria uma refeição independente; o vínculo treino /
    // descanso só é criado pelo botão dedicado abaixo.
    delete copy.pairId;
    copy.day_type = "all";
    copy.excludeFromDayTotal = false;
    // __id novo pra cópia — é um item distinto agora; manter o __id do
    // original quebraria o drag-and-drop (dois itens com o mesmo id).
    copy.__id = genItemId("meal");
    const next = [...payload.meals];
    next.splice(mealIdx + 1, 0, copy);
    setPayload({ ...payload, meals: next });
  }

  function createDayTypeVersion(mealIdx: number) {
    const orig = payload.meals[mealIdx] as any;
    if (!orig || orig.pairId) return;

    // Refeições novas e legadas sem day_type começam como a versão de treino;
    // a cópia recebe a versão de descanso e pode ser editada livremente.
    const sourceType: "training" | "rest" = orig.day_type === "rest" ? "rest" : "training";
    const variantType: "training" | "rest" = sourceType === "rest" ? "training" : "rest";
    const pairId = genItemId("meal-pair");
    const nextSource = {
      ...orig,
      day_type: sourceType,
      pairId,
      excludeFromDayTotal: false,
    };
    const variant = JSON.parse(JSON.stringify(orig));
    variant.name = `${orig.name || "Refeição"} (${variantType === "rest" ? "sem treino" : "com treino"})`;
    variant.day_type = variantType;
    variant.pairId = pairId;
    // Mantém só uma perna do par na barra geral de macros; os cards
    // separados da aba Macros continuam calculando cada tipo de dia.
    variant.excludeFromDayTotal = true;
    variant.__id = genItemId("meal");

    const next = [...payload.meals];
    next[mealIdx] = nextSource;
    next.splice(mealIdx + 1, 0, variant);
    setPayload({ ...payload, meals: next });
    toast.success("Versão sem treino criada. Edite a cópia e salve o protocolo.");
  }

  const dayMacros = useMemo(() => calcDayMacros(payload.meals), [payload.meals]);
  const goals = payload.macros;
  const bars = [
    { label: "Kcal", cur: dayMacros.kcal, goal: goals.calories || 1, color: "bg-primary" },
    { label: "Prot", cur: dayMacros.protein, goal: goals.protein || 1, color: "bg-blue-500" },
    { label: "Carb", cur: dayMacros.carbs, goal: goals.carbs || 1, color: "bg-amber-500" },
    { label: "Gord", cur: dayMacros.fat, goal: goals.fat || 1, color: "bg-rose-500" },
  ];

  function updMealField(mealIdx: number, patch: Partial<ProtocolPayload["meals"][number]>) {
    const next = [...payload.meals];
    next[mealIdx] = { ...next[mealIdx], ...patch };
    setPayload({ ...payload, meals: next });
  }

  function getOptsForKind(meal: any, kind: "carb" | "protein" | "fat") {
    const all: any[] = Array.isArray(meal.options) ? meal.options : [];
    const filtered = all.filter((o: any) => o?.kind === kind);
    if (filtered.length === 0) filtered.push({ kind, title: "Opção 1", notes: "", items: [{ name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false }] });
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

  // Ajusta a gramagem de uma opção (Op 2/3) para bater o mesmo total de
  // kcal/macro da Opção 1, preservando a proporção de peso entre os itens
  // da Opção 1. Ver suggestProportionalWeights() em macroCalc.ts.
  function applyProportionalAdjust(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number) {
    const meal = payload.meals[mealIdx];
    const opts = getOptsForKind(meal, kind);
    const refOption = opts[0];
    const targetOption = opts[optIdx];
    if (!targetOption || optIdx === 0) return;

    const result = suggestProportionalWeights(refOption, targetOption, kind);
    if (!result.ok) {
      toast.warning(result.reason || "Não foi possível calcular o ajuste automático.");
      return;
    }

    const items = (targetOption.items as any[]).map((it, i) => {
      const found = result.items.find((r) => r.index === i);
      if (!found || !found.resolved) return it;
      return { ...it, weight: `${found.grams}g`, rawWeight: found.grams };
    });
    updOption(mealIdx, kind, optIdx, { items });

    const unresolvedCount = result.items.filter((r) => !r.resolved).length;
    if (unresolvedCount > 0) {
      toast.info(`Peso ajustado. ${unresolvedCount} alimento(s) não reconhecido(s) na TACO ficaram de fora do cálculo.`);
    } else {
      toast.success("Gramagem ajustada conforme a Opção 1.");
    }
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
    if (patch.substitution === undefined && "substitution" in patch) delete items[itemIdx].substitution;
    if (patch.isTaco === true) {
      items[itemIdx].name = items[itemIdx].baseName || items[itemIdx].name || "";
      items[itemIdx].weight = "";
    }
    updOption(mealIdx, kind, optIdx, { items });
  }

  // Atualiza apenas a substituição anexada ao alimento (nunca soma nos macros).
  function updSubstitution(mealIdx: number, kind: "carb" | "protein" | "fat", optIdx: number, itemIdx: number, patch: any) {
    const opts = getOptsForKind(payload.meals[mealIdx], kind);
    const items = [...(opts[optIdx].items as any[])];
    const cur = items[itemIdx]?.substitution || {};
    items[itemIdx] = { ...items[itemIdx], substitution: { ...cur, ...patch } };
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
    carb:    { label: "ESCOLHA UM CARBOIDRATO", color: "text-blue-600",   bg: "bg-blue-500/5",   border: "border-blue-500/20" },
    protein: { label: "ESCOLHA UMA PROTEÍNA",   color: "text-rose-600",   bg: "bg-rose-500/5",   border: "border-rose-500/20" },
    fat:     { label: "ESCOLHA UMA GORDURA",    color: "text-amber-600",  bg: "bg-amber-500/5",  border: "border-amber-500/20" },
  };

  return (
    <div className="space-y-3">
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

      <DndContext sensors={mealSensors} collisionDetection={closestCenter} onDragEnd={handleMealDragEnd}>
      <SortableContext
        items={payload.meals.map((m: any, i) => m.__id ?? `meal-${i}`)}
        strategy={verticalListSortingStrategy}
      >
      {payload.meals.map((m, mealIdx) => {
        const isCollapsed = !!collapsedMeals[mealIdx];
        const mealM = calcMealMacros(m);
        const mealId = (m as any).__id ?? `meal-${mealIdx}`;
        return (
        <SortableMealCard key={mealId} id={mealId}>
        {({ attributes, listeners }) => (
        <Card className={`bg-card/60 border-border ${isCollapsed ? "overflow-hidden" : "overflow-visible relative focus-within:z-50"}`}>
          <div className={`flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/10 ${isCollapsed ? "" : "rounded-t-xl"}`}>
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="text-muted-foreground hover:text-primary p-1.5 shrink-0 cursor-grab active:cursor-grabbing touch-none"
              title="Arrastar para reordenar"
              aria-label="Arrastar refeição"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <Input
              list="meal-name-presets"
              value={m.name}
              onChange={(e) => updMealField(mealIdx, { name: e.target.value })}
              placeholder="Nome (Café, Almoço...)"
              className="h-8 text-sm font-bold text-primary flex-1 min-w-[140px]"
            />
            <Input value={m.time} onChange={(e) => updMealField(mealIdx, { time: e.target.value })} placeholder="07:00" className="h-8 text-sm w-20 shrink-0" />
            {isCollapsed && mealM.kcal > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-muted/40 border border-border/40">
                {Math.round(mealM.kcal)} kcal
              </span>
            )}
            {/* Dia em que a refeição se aplica — independente do ciclo de carbo */}
            {(() => {
              const dayType = ((m as any).day_type ?? "all") as "all" | "training" | "rest";
              const DAY_TYPE_STYLE: Record<string, string> = {
                all: "border-border/50 text-muted-foreground",
                training: "bg-primary/15 border-primary/40 text-primary",
                rest: "bg-sky-500/15 border-sky-500/40 text-sky-500",
              };
              return (
                <Select
                  value={dayType}
                  onValueChange={(v) => updMealField(mealIdx, { day_type: v } as any)}
                >
                  <SelectTrigger
                    className={`h-8 w-[132px] shrink-0 text-xs font-semibold ${DAY_TYPE_STYLE[dayType]}`}
                    title="Em que dias esta refeição se aplica"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Dias</SelectItem>
                    <SelectItem value="training">Dia de Treino</SelectItem>
                    <SelectItem value="rest">Dia de Descanso</SelectItem>
                  </SelectContent>
                </Select>
              );
            })()}
            {payload.setup.carbCycle && (
              <button type="button"
                onClick={() => updMealField(mealIdx, { carbCycle: !(m as any).carbCycle } as any)}
                className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${(m as any).carbCycle ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500" : "border-border/50 text-muted-foreground"}`}>
                <TrendingUp className="w-3.5 h-3.5" /> Ciclo
              </button>
            )}
            {!((m as any).pairId) && (
              <button
                type="button"
                onClick={() => createDayTypeVersion(mealIdx)}
                className="h-8 px-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-600 text-[10px] font-semibold transition-colors flex items-center gap-1 shrink-0 hover:bg-sky-500/20"
                title={(m as any).day_type === "rest" ? "Criar uma cópia desta refeição para dias de treino" : "Criar uma cópia desta refeição para dias sem treino"}
              >
                <Copy className="w-3 h-3" />
                <span className="hidden sm:inline">{(m as any).day_type === "rest" ? "Criar com treino" : "Criar sem treino"}</span>
                <span className="sm:hidden">{(m as any).day_type === "rest" ? "Com treino" : "Sem treino"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsedMeals((prev) => ({ ...prev, [mealIdx]: !isCollapsed }))}
              className="text-muted-foreground hover:text-primary p-1.5 shrink-0"
              title={isCollapsed ? "Expandir refeição" : "Minimizar refeição"}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
            </button>
            <button onClick={() => duplicateMeal(mealIdx)} className="text-muted-foreground hover:text-primary p-1.5 shrink-0" title="Duplicar refeição"><Copy className="w-3.5 h-3.5" /></button>
            <button onClick={() => setSaveTplFor({ idx: mealIdx, name: m.name || "Modelo", kind: "mixed" })} className="text-muted-foreground hover:text-primary p-1.5 shrink-0" title="Salvar como modelo"><BookmarkPlus className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPayload({ ...payload, meals: payload.meals.filter((_, idx) => idx !== mealIdx) })} className="text-muted-foreground hover:text-destructive p-1.5 shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>

          {!isCollapsed && (
          <div className="p-4 space-y-3">
            {(["carb", "protein", "fat"] as const).map((kind) => {
              const cfg = KIND[kind];
              const hidden = Array.isArray((m as any).hiddenKinds) && (m as any).hiddenKinds.includes(kind);
              if (hidden) return null;
              const opts = getOptsForKind(m, kind);
              const kindCollapsed = isKindCollapsed(mealIdx, kind);
              return (
                <div key={kind} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <button
                      type="button"
                      onClick={() => toggleKind(mealIdx, kind)}
                      className={`flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold ${cfg.color} hover:opacity-80`}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${kindCollapsed ? "-rotate-90" : ""}`} />
                      {cfg.label}
                    </button>
                    <div className="flex items-center gap-2">
                      {!kindCollapsed && opts.length < 3 && (
                        <button type="button" onClick={() => addOption(mealIdx, kind)} className={`text-[10px] flex items-center gap-1 ${cfg.color} opacity-60 hover:opacity-100 transition-opacity`}>
                          <Plus className="w-3 h-3" /> + opção
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remover este macro desta refeição"
                        onClick={() => {
                          const cur = Array.isArray((m as any).hiddenKinds) ? [...(m as any).hiddenKinds] : [];
                          if (!cur.includes(kind)) cur.push(kind);
                          updMealField(mealIdx, { hiddenKinds: cur } as any);
                        }}
                        className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-destructive opacity-70 hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" /> remover
                      </button>
                    </div>
                  </div>

                  {!kindCollapsed && <div className="space-y-2.5">
                    {opts.map((opt: any, optIdx: number) => {
                      const items: any[] = Array.isArray(opt.items) ? opt.items : [];
                      const optM = optionMacros(opt);
                      const mainM = optIdx === 0 ? optM : optionMacros(opts[0]);
                      const delta = optIdx > 0 ? compareOptions(mainM, optM) : null;
                      const sevCls: Record<SubstitutionSeverity, string> = {
                        ok:   "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                        warn: "bg-amber-500/15 text-amber-500 border-amber-500/40",
                        err:  "bg-rose-500/15 text-rose-500 border-rose-500/40",
                      };
                      const sevLabel: Record<SubstitutionSeverity, string> = {
                        ok: "equivalente", warn: "atenção", err: "desbalanceada",
                      };
                      return (
                        <div key={optIdx} className="relative focus-within:z-[60] bg-card rounded-lg border border-border/50 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} border ${cfg.border}`}>Op {optIdx + 1}</span>
                            <Input value={opt.title || ""} onChange={(e) => updOption(mealIdx, kind, optIdx, { title: e.target.value })} placeholder="Título (ex: versão off-season)" className="h-6 text-[11px] flex-1 bg-transparent border-0 border-b border-dashed rounded-none px-1" />
                            {optIdx > 0 && (
                              <button
                                type="button"
                                onClick={() => applyProportionalAdjust(mealIdx, kind, optIdx)}
                                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-dashed border-primary/40 text-primary/80 hover:bg-primary/10 hover:text-primary flex items-center gap-1"
                                title="Calcula a gramagem de cada alimento desta opção proporcionalmente à Opção 1, batendo o mesmo total de kcal/macro"
                              >
                                <Wand2 className="w-3 h-3" /> Ajustar p/ Op 1
                              </button>
                            )}
                            {optIdx > 0 && (
                              <button type="button" onClick={() => removeOption(mealIdx, kind, optIdx)} className="text-muted-foreground hover:text-destructive p-0.5 shrink-0"><Trash2 className="w-3 h-3" /></button>
                            )}
                          </div>
                          <Input value={(opt as any).notes || ""} onChange={(e) => updOption(mealIdx, kind, optIdx, { notes: e.target.value })} placeholder="Observação (ex: usar nos dias de treino pesado)" className="h-6 text-[11px] w-full bg-transparent border-0 border-b border-dashed rounded-none px-1 mb-2 text-muted-foreground" />

                          <div className="space-y-1.5">
                            {items.map((it: any, ii: number) => (
                              <div key={ii} className="relative focus-within:z-[70] bg-background rounded border border-border/40 px-2 py-2 space-y-1.5">
                                {(it as any).optional && (
                                  <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">
                                    ⚡ Opcional (não soma) — legado
                                  </span>
                                )}
                                <FoodRow
                                  it={it}
                                  kind={kind}
                                  onPickTaco={(taco) => {
                                    const tKind = tacoGroupToKind(taco.group);
                                    if (tKind !== kind) {
                                      const kindLabel = kind === "protein" ? "Proteína" : kind === "fat" ? "Gordura" : "Carbo";
                                      const tacoLabel = tKind === "protein" ? "Proteína" : tKind === "fat" ? "Gordura" : "Carbo";
                                      toast.warning(`"${taco.name}" é classificado como ${tacoLabel} no TACO`, {
                                        description: `Você está adicionando em ${kindLabel}. As kcal serão calculadas normalmente.`,
                                        duration: 5000,
                                      });
                                      // NÃO retorna — permite a inserção normalmente
                                    }
                                    const isInd = taco.source === "industrial";
                                    updItem(mealIdx, kind, optIdx, ii, {
                                      baseName: taco.name,
                                      name: taco.name,
                                      isTaco: !isInd,
                                      isIndustrial: isInd,
                                      cookFactor: taco.cookFactor ?? 1,
                                    });
                                  }}
                                  onChangeName={(name) => updItem(mealIdx, kind, optIdx, ii, { name, baseName: name, isTaco: false, isIndustrial: false, cookFactor: 1, rawWeight: 0 })}
                                  onChangeWeight={(w) => {
                                    const patch: any = { weight: w };
                                    if (it.isTaco || it.isIndustrial) {
                                      const tacoRef = TACO_FOODS.find(
                                        (t) => t.name.toLowerCase() === String(it.baseName || it.name).toLowerCase()
                                      );
                                      const unitW = tacoRef && typeof (tacoRef as any).unitWeight === "number"
                                        ? (tacoRef as any).unitWeight
                                        : 50;
                                      const { grams } = parseWeightString(w, unitW);
                                      patch.rawWeight = isFinite(grams) && grams > 0 ? grams : 0;
                                    }
                                    updItem(mealIdx, kind, optIdx, ii, patch);
                                  }}
                                  onRemove={() => rmItem(mealIdx, kind, optIdx, ii)}
                                />

                                {/* Substituição opcional anexada (máx. 1 por alimento) */}
                                {it.substitution ? (
                                  <div className="mt-1 ml-2 pl-2.5 border-l-2 border-dashed border-amber-500/40 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">
                                        ↳ 🔁 Substituição opcional (não soma)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => updItem(mealIdx, kind, optIdx, ii, { substitution: undefined })}
                                        className="text-[9px] text-muted-foreground hover:text-destructive"
                                        title="Remover substituição"
                                      >
                                        remover
                                      </button>
                                    </div>
                                    <FoodRow
                                      it={it.substitution}
                                      kind={kind}
                                      onPickTaco={(taco) => {
                                        const isInd = taco.source === "industrial";
                                        const grams = equivalentGramsForKcal(it, taco);
                                        updSubstitution(mealIdx, kind, optIdx, ii, {
                                          baseName: taco.name,
                                          name: taco.name,
                                          isTaco: !isInd,
                                          isIndustrial: isInd,
                                          cookFactor: taco.cookFactor ?? 1,
                                          weight: grams > 0 ? `${grams}g` : "",
                                          rawWeight: grams > 0 ? grams : 0,
                                        });
                                        if (grams > 0) {
                                          toast.success(`Quantidade equivalente calculada: ${grams}g (mesma kcal do alimento principal)`, {
                                            description: "Você pode editar o valor manualmente.",
                                          });
                                        }
                                      }}
                                      onChangeName={(name) => updSubstitution(mealIdx, kind, optIdx, ii, { name, baseName: name, isTaco: false, isIndustrial: false, cookFactor: 1, rawWeight: 0 })}
                                      onChangeWeight={(w) => {
                                        const sub = it.substitution || {};
                                        const patch: any = { weight: w };
                                        if (sub.isTaco || sub.isIndustrial) {
                                          const tacoRef = TACO_FOODS.find(
                                            (t) => t.name.toLowerCase() === String(sub.baseName || sub.name).toLowerCase()
                                          );
                                          const unitW = tacoRef && typeof (tacoRef as any).unitWeight === "number" ? (tacoRef as any).unitWeight : 50;
                                          const { grams } = parseWeightString(w, unitW);
                                          patch.rawWeight = isFinite(grams) && grams > 0 ? grams : 0;
                                        }
                                        updSubstitution(mealIdx, kind, optIdx, ii, patch);
                                      }}
                                      onRemove={() => updItem(mealIdx, kind, optIdx, ii, { substitution: undefined })}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => updItem(mealIdx, kind, optIdx, ii, { substitution: { name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false } })}
                                    className="text-[10px] flex items-center gap-1 px-1 text-amber-600 opacity-70 hover:opacity-100"
                                    title="Anexa 1 alternativa equivalente em kcal — não soma nos macros"
                                  >
                                    <Plus className="w-3 h-3" /> substituição opcional
                                  </button>
                                )}
                              </div>
                            ))}

                          </div>
                          <button type="button" onClick={() => addItem(mealIdx, kind, optIdx)} className={`mt-1.5 text-[11px] flex items-center gap-1 px-1 ${cfg.color} opacity-60 hover:opacity-100`}><Plus className="w-3 h-3" /> alimento</button>
                          {(optM.kcal > 0 || optM.protein > 0 || optM.carbs > 0 || optM.fat > 0) && (
                            <div className="mt-2 pt-2 border-t border-dashed border-border/40 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 text-[10px] tabular-nums" title="Cálculo automático — visível apenas para o coach">
                                <span className="font-bold text-foreground">{Math.round(optM.kcal)} kcal</span>
                                <span className="text-blue-500">{optM.protein.toFixed(1)}p</span>
                                <span className="text-amber-500">{optM.carbs.toFixed(1)}c</span>
                                <span className="text-rose-500">{optM.fat.toFixed(1)}g</span>
                              </div>
                              {delta && (
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${sevCls[delta.severity]}`}
                                  title={`vs Op 1 — Δ kcal ${delta.kcal >= 0 ? "+" : ""}${delta.kcal} (${Math.round(delta.kcalPct*100)}%) · P ${delta.protein >= 0 ? "+" : ""}${delta.protein} · C ${delta.carbs >= 0 ? "+" : ""}${delta.carbs} · G ${delta.fat >= 0 ? "+" : ""}${delta.fat}`}
                                >
                                  {sevLabel[delta.severity]}
                                  {delta.severity !== "ok" && delta.worstMetric && (
                                    <span className="ml-1 opacity-80">· {delta.worstMetric === "kcal" ? "kcal" : delta.worstMetric === "protein" ? "P" : delta.worstMetric === "carbs" ? "C" : "G"}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>}
                </div>
              );
            })}

            {Array.isArray((m as any).hiddenKinds) && (m as any).hiddenKinds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Macros ocultos:</span>
                {((m as any).hiddenKinds as Array<"carb"|"protein"|"fat">).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      const cur = ((m as any).hiddenKinds as string[]).filter((x) => x !== k);
                      updMealField(mealIdx, { hiddenKinds: cur } as any);
                    }}
                    className="text-[10px] px-2 py-1 rounded border border-dashed border-border/60 text-muted-foreground hover:text-primary hover:border-primary inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {k === "carb" ? "Carbo" : k === "protein" ? "Proteína" : "Gordura"}
                  </button>
                ))}
              </div>
            )}

            <div className="pt-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Observação da refeição</Label>
              <Textarea
                value={(m as any).notes || ""}
                onChange={(e) => updMealField(mealIdx, { notes: e.target.value } as any)}
                placeholder="Ex.: tomar 30 min após o treino · evitar líquidos · café sem açúcar..."
                className="mt-1 min-h-[60px] text-xs"
              />
            </div>
          </div>
          )}
        </Card>
        )}
        </SortableMealCard>
        );
      })}
      </SortableContext>
      </DndContext>
      <Button variant="outline" size="sm" onClick={() => setPayload({ ...payload, meals: [...payload.meals, makeEmptyMeal(`Refeição ${payload.meals.length + 1}`)] })} className="w-full">
        <Plus className="w-4 h-4 mr-1.5" /> Adicionar Nova Refeição
      </Button>

      <datalist id="meal-name-presets">
        {MEAL_NAME_PRESETS.map((n) => <option key={n} value={n} />)}
      </datalist>

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

function FoodRow({
  it, onPickTaco, onChangeName, onChangeWeight, onRemove,
}: {
  it: any;
  kind: "carb" | "protein" | "fat";
  onPickTaco: (t: FoodHit) => void;
  onChangeName: (s: string) => void;
  onChangeWeight: (s: string) => void;
  onRemove: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const rawQ = (it.baseName || it.name || "").toString().trim();
  
  const matches = useMemo<FoodHit[]>(() => {
    if (rawQ.length < 2) return [];
    
    // Texto limpo sem acentos e em minúsculas
    const normalizedQ = rawQ.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // 1. Força a busca varrendo 100% da tabela TACO localmente (ignora acentos)
    const tacoMatches = TACO_DATA.filter(t => 
      t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normalizedQ)
    ).map(t => ({ ...t, source: "taco" as const }));
    
    // 2. Puxa a busca do sistema para não perdermos os Industrializados
    const sysMatches = searchFoods(rawQ, 15) || [];
    
    // 3. Mescla tudo, priorizando a TACO e removendo duplicatas
    const merged = [...tacoMatches, ...sysMatches];
    const unique: FoodHit[] = [];
    const seen = new Set();
    
    for (const item of merged) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        unique.push(item);
      }
    }
    
    // Aumentamos para 15 para exibir todas as variações (ex: Feijão carioca, preto, cru, cozido...)
    return unique.slice(0, 15);
  }, [rawQ]);

  const showSuggestions = focused && matches.length > 0 && !it.isTaco && !it.isIndustrial;

  return (
    <>
      <div className="flex items-center gap-1.5 relative">
        <div className="relative flex-1">
          <Input
            value={it.baseName || it.name || ""}
            onChange={(e) => onChangeName(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Nome do alimento (digite para ver sugestões TACO)…"
            className="h-8 text-xs w-full"
          />
          {showSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
              <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                Sugestões TACO — clique para usar ou continue digitando
              </div>
              {matches.map((taco) => {
                const tKind = tacoGroupToKind(taco.group);
                const badgeCls = tKind === "protein"
                  ? "bg-blue-500/10 text-blue-600"
                  : tKind === "fat"
                  ? "bg-rose-500/10 text-rose-500"
                  : "bg-amber-500/10 text-amber-600";
                const badgeLabel = tKind === "protein" ? "prot" : tKind === "fat" ? "gord" : "carb";
                return (
                  <button
                    key={`${taco.source}-${taco.name}`}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onPickTaco(taco); setFocused(false); }}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    <span className="flex-1 truncate">{taco.name}</span>
                    {taco.source === "industrial" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-violet-500/10 text-violet-500 border border-violet-500/30" title={`Industrializado · ${taco.brand}`}>IND</span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${badgeCls}`}>{badgeLabel}</span>
                    {taco.cookFactor !== 1 && <span className="text-[9px] text-muted-foreground">×{taco.cookFactor}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {it.isTaco && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 shrink-0" title="Vinculado à tabela TACO">TACO</span>
        )}
        {it.isIndustrial && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/30 shrink-0" title="Alimento industrializado (rótulo do fabricante)">IND</span>
        )}
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-muted-foreground shrink-0">Quantidade</label>
        <Input
          value={it.weight ?? ""}
          onChange={(e) => onChangeWeight(e.target.value)}
          placeholder={it.isTaco ? "ex: 100g (cru) ou 8 unidades…" : "ex: 8 unidades, 200g, 2 fatias…"}
          className="h-7 text-xs flex-1"
        />
      </div>
    </>
  );
}
