/**
 * DietTab.tsx — aba "Dieta" do ProtocolBuilder.
 * Extraído de ProtocolBuilder.tsx sem alteração de comportamento.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Copy, BookmarkPlus, Library, UtensilsCrossed, Pill,
  ArrowUp, ArrowDown, Eye, AlertCircle, Sparkles, CheckCircle2, Loader2, TrendingUp,
  Wand2, GripVertical, MoreHorizontal,
} from "lucide-react";
import { toIndependentMeal } from "@/lib/mealCopy";
import { DietTemplateQuickPicker } from "@/components/coach/DietTemplateQuickPicker";
import { ModelsMenu } from "./ModelsMenu";
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
  calcMealMacros, calcDayMacros, tacoGroupToKind, resolveQuantity, quantityHintsFor, calcItemMacros,
  optionMacros, compareOptions, suggestProportionalWeights, type SubstitutionSeverity,
} from "@/lib/macroCalc";
import { searchFoods, type FoodHit } from "@/lib/foodSearch";
import { isDefaultOptionTitle, mealFoodsPreview, visibleOptionIndexes } from "@/lib/dietEditorView";
import { householdApprox } from "@/lib/householdMeasures";
import { TACO_FOODS } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";

const FOOD_CATALOG = [...ENRICHED_FOODS, ...TACO_FOODS];
const CUT_VARIANT_PAIRS = [
  ["Carne, bovina, picanha, com gordura, crua", "Carne, bovina, picanha, sem gordura, crua"],
  // Nomes que a busca mostra hoje (a base enriquecida é trocada pelo equivalente com parênteses).
  ["Picanha c/ gordura (crua)", "Picanha s/ gordura (crua)"],
  ["Frango, sobrecoxa, com pele, crua", "Frango, sobrecoxa, sem pele, crua"],
  ["Bisteca suína c/ gordura (crua)", "Bisteca suína s/ gordura (crua)"],
];
const TACO_DATA = FOOD_CATALOG.map((t, i) => ({ ...t, id: String(i), cookFactor: t.cookFactor ?? 1 }));

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

export function DietTab({ payload, setPayload, onOpenTemplateLibrary }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void; onOpenTemplateLibrary?: () => void }) {
  const [coachId, setCoachId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setCoachId(data.session?.user?.id ?? null); }); }, []);

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
  }, [payload.meals]);

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

  // Reordenação manual (menu ⋯ da refeição) — alternativa acessível ao drag-and-drop.
  function moveMeal(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= payload.meals.length) return;
    const next = [...payload.meals];
    [next[index], next[target]] = [next[target], next[index]];
    setPayload({ ...payload, meals: next });
  }

  const [saveTplFor, setSaveTplFor] = useState<{ idx: number; name: string; kind: string } | null>(null);
  const [loadTplOpen, setLoadTplOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  // ── Dieta enxuta: uma refeição aberta por vez ──────────────────────────
  // Fechada, a refeição vira uma linha (nome · horário · alimentos · kcal).
  // O estado é por __id (não por posição), então reordenar não troca qual
  // refeição está aberta.
  const mealIdOf = (meal: any, i: number): string => meal?.__id ?? `meal-${i}`;
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  // Com uma refeição só, ela já abre (também depois do backfill de __id).
  const onlyMealId = payload.meals.length === 1 ? mealIdOf(payload.meals[0], 0) : null;
  useEffect(() => { if (onlyMealId) setOpenMealId(onlyMealId); }, [onlyMealId]);

  // O que o coach pediu para mostrar mesmo vazio nesta sessão: "+ Opção 2",
  // "+ obs" e "+ Observação da refeição". Chaves: "<mealId>|<kind>|<opt>[|notes]".
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const reveal = (key: string) => setRevealed((prev) => ({ ...prev, [key]: true }));
  const optKey = (mealId: string, kind: string, optIdx: number) => `${mealId}|${kind}|${optIdx}`;
  const forgetGroupReveals = (mealId: string, kind: string) =>
    setRevealed((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${mealId}|${kind}|`))));

  function addMeal() {
    const meal = makeEmptyMeal(`Refeição ${payload.meals.length + 1}`);
    setPayload({ ...payload, meals: [...payload.meals, meal] });
    setOpenMealId(meal.__id ?? null);
  }
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
      const meal = toIndependentMeal(tpl.meal_data);
      meal.name = meal.name || tpl.name;
      setPayload({ ...payload, meals: [...payload.meals, meal] });
      setOpenMealId(meal.__id);
      toast.success("Modelo adicionado");
      setLoadTplOpen(false);
    } catch { toast.error("Modelo inválido"); }
  }

  function duplicateMeal(mealIdx: number) {
    const orig = payload.meals[mealIdx];
    const copy = toIndependentMeal(orig, { name: `${orig.name || "Refeição"} (cópia)` });
    const next = [...payload.meals];
    next.splice(mealIdx + 1, 0, copy);
    setPayload({ ...payload, meals: next });
    setOpenMealId(copy.__id);
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
    setOpenMealId(variant.__id);
    toast.success(`Versão ${variantType === "rest" ? "sem" : "com"} treino criada. Edite a cópia e salve o protocolo.`);
  }

  const dayMacros = useMemo(
    () => calcDayMacros(payload.meals.filter((meal) => !(meal as any).excludeFromDayTotal)),
    [payload.meals],
  );
  const goals = payload.macros;
  const bars = [
    { label: "Kcal", cur: dayMacros.kcal, goal: goals.calories || 1, color: "bg-primary" },
    { label: "Prot", cur: dayMacros.protein, goal: goals.protein || 1, color: "bg-blue-500" },
    { label: "Carb", cur: dayMacros.carbs, goal: goals.carbs || 1, color: "bg-amber-500" },
    { label: "Gord", cur: dayMacros.fat, goal: goals.fat || 1, color: "bg-rose-500" },
    { label: "Fibra", cur: dayMacros.fiber || 0, goal: Number((goals as any).fiber ?? 25) || 1, color: "bg-emerald-500" },
  ];
  const fiberUnknown = dayMacros.fiberUnknown || 0;

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

  const KIND: Record<"carb" | "protein" | "fat", { label: string; short: string; color: string; bg: string; border: string }> = {
    // Cores iguais às do placar do dia e da visão do aluno: carbo = âmbar, proteína = azul, gordura = rosa.
    carb:    { label: "ESCOLHA UM CARBOIDRATO", short: "CARBOIDRATO", color: "text-amber-600",  bg: "bg-amber-500/5",  border: "border-amber-500/20" },
    protein: { label: "ESCOLHA UMA PROTEÍNA",   short: "PROTEÍNA",    color: "text-blue-600",   bg: "bg-blue-500/5",   border: "border-blue-500/20" },
    fat:     { label: "ESCOLHA UMA GORDURA",    short: "GORDURA",     color: "text-rose-600",   bg: "bg-rose-500/5",   border: "border-rose-500/20" },
  };

  return (
    <div className="space-y-3">
      {/* Fica abaixo do cabeçalho fixo da tela de edição (--coach-header-h, definido no CoachDashboard).
          z-40: acima da refeição em edição (z-30) e abaixo de menus e diálogos (z-50) —
          antes era z-60 e cobria o topo da biblioteca e dos menus abertos daqui. */}
      <div className="sticky top-[var(--coach-header-h,0px)] z-40 -mx-2 px-2 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <Card className="bg-card/80 border-border p-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">Macros do dia (auto) vs meta</p>
            {/* Modelos: mesmo botão e mesmo canto das outras abas (Pacote B da auditoria). */}
            <ModelsMenu
              sections={[
                { title: "Dieta inteira", content: <DietTemplateQuickPicker payload={payload} setPayload={setPayload} coachId={coachId} /> },
                {
                  title: "Uma refeição",
                  content: (close) => (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => { close(); setLoadTplOpen(true); }}
                      title="Adiciona UMA refeição salva no fim da dieta"
                      data-testid="add-saved-meal"
                    >
                      <Library className="w-3.5 h-3.5 mr-1.5" /> Adicionar refeição salva
                    </Button>
                  ),
                },
              ]}
              onOpenLibrary={onOpenTemplateLibrary}
            />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {bars.map((b) => {
              const pct = Math.min(150, Math.round((b.cur / b.goal) * 100));
              const over = b.cur > b.goal;
              return (
                <div key={b.label}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-1">
                    <span className="text-[11px] uppercase font-semibold text-muted-foreground">{b.label}</span>
                    <span className={`text-[11px] font-bold ${over ? "text-rose-500" : "text-foreground"}`}>{Math.round(b.cur)}/{Math.round(b.goal)}{b.label === "Fibra" && fiberUnknown > 0 ? "*" : ""}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                    <div className={`${over ? "bg-rose-500" : b.color} h-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {fiberUnknown > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-amber-600">
              <AlertCircle className="w-3 h-3 mt-px shrink-0" />
              <span>
                * Fibra pode estar subestimada: {fiberUnknown} {fiberUnknown === 1 ? "alimento está" : "alimentos estão"} sem dado de fibra na base e {fiberUnknown === 1 ? "não entrou" : "não entraram"} na soma.
                Procure o aviso <strong>“sem dado de fibra”</strong> abaixo do alimento.
              </span>
            </p>
          )}
        </Card>
      </div>
      {/* Por aluno: medida caseira aproximada ao lado dos gramas, na tela do aluno. */}
      <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 cursor-pointer" data-testid="household-toggle">
        <Switch
          checked={!!payload.setup.showHouseholdMeasures}
          onCheckedChange={(v) => setPayload({ ...payload, setup: { ...payload.setup, showHouseholdMeasures: v } })}
          aria-label="Mostrar medidas caseiras ao aluno"
          className="mt-0.5"
        />
        <span className="min-w-0">
          <span className="block text-xs font-semibold">Mostrar medidas caseiras ao aluno</span>
          <span className="block text-[11px] text-muted-foreground">
            Você continua prescrevendo em gramas; o aluno vê "120 g ≈ 5 colheres de sopa" (medidas do IBGE, quando o alimento tem).
          </span>
        </span>
      </label>

      <DndContext sensors={mealSensors} collisionDetection={closestCenter} onDragEnd={handleMealDragEnd}>
      <SortableContext
        items={payload.meals.map((m: any, i) => mealIdOf(m, i))}
        strategy={verticalListSortingStrategy}
      >
      <div className="space-y-2">
      {payload.meals.map((m, mealIdx) => {
        const mealId = mealIdOf(m, mealIdx);
        const isOpen = openMealId === mealId;
        const mealM = calcMealMacros(m);
        const dayType = ((m as any).day_type ?? "all") as "all" | "training" | "rest";
        const cycleOn = !!payload.setup.carbCycle && !!(m as any).carbCycle;
        const excluded = !!(m as any).excludeFromDayTotal;
        const myPairId = typeof (m as any).pairId === "string" ? (m as any).pairId : "";
        // pairId preenchido mas sem parceira real: a aluna não vê o botão de
        // alternar (por design, desde a correção do "botão fantasma"). Provável
        // causa: a outra metade foi apagada/editada fora do fluxo "Criar sem
        // treino", ou é um par antigo criado antes dessa correção.
        const pairBroken = !!myPairId && !payload.meals.some(
          (mm, idx) => idx !== mealIdx && (mm as any).pairId === myPairId,
        );
        const deleteMeal = () => {
                const target = payload.meals[mealIdx] as any;
                const targetPairId = typeof target?.pairId === "string" ? target.pairId : null;
                const nextMeals = payload.meals
                  .filter((_, idx) => idx !== mealIdx)
                  .map((mm) => {
                    // Se a refeição removida era metade de um par, a outra metade não
                    // pode ficar órfã com pairId — senão o botão de alternar versão
                    // continua aparecendo pro aluno numa refeição sem parceira.
                    if (targetPairId && (mm as any).pairId === targetPairId) {
                      const { pairId, excludeFromDayTotal, ...rest } = mm as any;
                      return { ...rest, day_type: "all" };
                    }
                    return mm;
                  });
                setPayload({ ...payload, meals: nextMeals });
                if (isOpen) setOpenMealId(null);
        };
        const gripHandle = (attributes: any, listeners: any) => (
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
        );
        const pairBrokenButton = pairBroken ? (
          <button
            type="button"
            onClick={() => updMealField(mealIdx, { pairId: undefined, excludeFromDayTotal: false, day_type: "all" } as any)}
            className="h-7 px-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 text-[11px] font-semibold transition-colors flex items-center gap-1 shrink-0 hover:bg-amber-500/20"
            title="Esta refeição tem um par configurado, mas a outra metade não existe mais (ou nunca teve o mesmo pairId). Por isso a aluna não vê o botão de alternar. Clique para desfazer esse vínculo quebrado e, se quiser, crie o par de novo."
          >
            ⚠ Par quebrado — corrigir
          </button>
        ) : null;
        const excludedBadge = excluded ? (
          <span
            className="h-7 px-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 text-[11px] font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap"
            title="Esta refeição não entra nas kcal/macros do dia. Use o menu ⋯ para voltar a contabilizar."
          >
            <Eye className="w-3.5 h-3.5" /> Fora do total
          </span>
        ) : null;
        const mealMenu = (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-primary p-1.5 shrink-0" title="Mais ações da refeição" aria-label="Mais ações da refeição" data-testid={`meal-menu-${mealIdx}`}>
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => duplicateMeal(mealIdx)}><Copy className="w-3.5 h-3.5 mr-2" /> Duplicar refeição</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSaveTplFor({ idx: mealIdx, name: m.name || "Modelo", kind: "mixed" })}><BookmarkPlus className="w-3.5 h-3.5 mr-2" /> Salvar como modelo</DropdownMenuItem>
              {!myPairId && (
                <DropdownMenuItem onClick={() => createDayTypeVersion(mealIdx)}>
                  <Copy className="w-3.5 h-3.5 mr-2" /> {dayType === "rest" ? "Criar versão com treino" : "Criar versão sem treino"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => updMealField(mealIdx, { excludeFromDayTotal: !excluded } as any)}>
                <Eye className="w-3.5 h-3.5 mr-2" /> {excluded ? "Voltar a contabilizar nas kcal" : "Não contabilizar nas kcal"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={mealIdx === 0} onClick={() => moveMeal(mealIdx, -1)}><ArrowUp className="w-3.5 h-3.5 mr-2" /> Mover para cima</DropdownMenuItem>
              <DropdownMenuItem disabled={mealIdx === payload.meals.length - 1} onClick={() => moveMeal(mealIdx, 1)}><ArrowDown className="w-3.5 h-3.5 mr-2" /> Mover para baixo</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={deleteMeal}><Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir refeição</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
        const kcalBadge = mealM.kcal > 0 ? (
          <span
            className="text-[11px] font-semibold tabular-nums text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 flex items-center gap-1.5"
            title="Total desta refeição (primeira opção de cada grupo)"
          >
            <b className="text-foreground">{Math.round(mealM.kcal)} kcal</b>
            <span className="hidden sm:inline text-blue-500">{Math.round(mealM.protein)}p</span>
            <span className="hidden sm:inline text-amber-500">{Math.round(mealM.carbs)}c</span>
            <span className="hidden sm:inline text-rose-500">{Math.round(mealM.fat)}g</span>
            <span className="hidden sm:inline text-emerald-600">{mealM.fiber.toFixed(1)}f{mealM.fiberUnknown ? "*" : ""}</span>
          </span>
        ) : null;
        const foods = mealFoodsPreview(m);
        const mealNotesKey = `${mealId}|notes`;
        const showMealNotes = !!String((m as any).notes ?? "").trim() || !!revealed[mealNotesKey];
        return (
        <SortableMealCard key={mealId} id={mealId}>
        {({ attributes, listeners }) => (
        <Card
          className={`bg-card/60 border-border ${isOpen ? "overflow-visible relative focus-within:z-30 border-primary/30" : "overflow-hidden"}`}
          data-testid={`meal-card-${mealIdx}`}
        >
          {!isOpen ? (
            // ── Fechada: uma linha ─────────────────────────────────────────
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5">
              {gripHandle(attributes, listeners)}
              <button
                type="button"
                onClick={() => setOpenMealId(mealId)}
                className="flex-1 min-w-0 text-left flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5 py-1 rounded-md hover:bg-muted/30 px-1"
                aria-expanded={false}
                data-testid={`meal-summary-${mealIdx}`}
              >
                <span className="flex items-baseline gap-2 min-w-0 sm:shrink-0 sm:max-w-[38%]">
                  <span className="text-sm font-bold text-primary truncate">{m.name || `Refeição ${mealIdx + 1}`}</span>
                  {m.time && <span className="text-xs text-muted-foreground tabular-nums shrink-0">{m.time}</span>}
                  {dayType !== "all" && (
                    <span className={`text-[11px] font-semibold px-1.5 rounded border shrink-0 ${dayType === "training" ? "border-primary/40 text-primary" : "border-sky-500/40 text-sky-500"}`}>
                      {dayType === "training" ? "Treino" : "Descanso"}
                    </span>
                  )}
                  {mealM.kcal > 0 && <span className="sm:hidden text-[11px] text-muted-foreground tabular-nums shrink-0">{Math.round(mealM.kcal)} kcal</span>}
                </span>
                <span className={`text-xs truncate min-w-0 flex-1 ${foods.length ? "text-foreground/80" : "text-muted-foreground italic"}`}>
                  {foods.length ? foods.join(" · ") : "Sem alimentos ainda"}
                </span>
              </button>
              {mealM.kcal > 0 && (
                <span className="hidden sm:inline-flex text-[11px] font-semibold tabular-nums text-muted-foreground shrink-0 items-center gap-1.5" title="Total desta refeição (primeira opção de cada grupo)">
                  <b className="text-foreground">{Math.round(mealM.kcal)} kcal</b>
                  <span className="text-blue-500">{Math.round(mealM.protein)}p</span>
                  <span className="text-amber-500">{Math.round(mealM.carbs)}c</span>
                  <span className="text-rose-500">{Math.round(mealM.fat)}g</span>
                </span>
              )}
              {cycleOn && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 shrink-0" title="Entra no ciclo de carboidratos">
                  <TrendingUp className="w-3 h-3" /> ciclo
                </span>
              )}
              {excludedBadge}
              {pairBrokenButton}
              <button
                type="button"
                onClick={() => setOpenMealId(mealId)}
                className="text-muted-foreground hover:text-primary p-1.5 shrink-0"
                title="Abrir refeição"
                aria-label="Abrir refeição"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              {mealMenu}
            </div>
          ) : (
          <>
          {/* ── Aberta: cabeçalho editável ─────────────────────────────── */}
          {/* Celular: linha 1 = nome, horário, fechar e ⋯; linha 2 = dia, kcal, ciclo.
              Computador: tudo numa linha só. */}
          <div className="flex flex-wrap items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-border/40 bg-muted/10 rounded-t-xl">
            <div className="order-1 flex items-center gap-1.5 flex-1 min-w-0 sm:min-w-[260px]">
              {gripHandle(attributes, listeners)}
              <Input
                list="meal-name-presets"
                value={m.name}
                onChange={(e) => updMealField(mealIdx, { name: e.target.value })}
                placeholder="Nome (Café, Almoço...)"
                aria-label="Nome da refeição"
                className="h-8 text-sm font-bold text-primary flex-1 min-w-0"
              />
              <Input value={m.time} onChange={(e) => updMealField(mealIdx, { time: e.target.value })} placeholder="07:00" aria-label="Horário" className="h-8 text-sm w-[72px] shrink-0" />
            </div>
            <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-2 flex-wrap">
              {/* Dia em que a refeição se aplica — independente do ciclo de carbo */}
              <Select
                value={dayType}
                onValueChange={(v) => updMealField(mealIdx, { day_type: v } as any)}
              >
                <SelectTrigger
                  className={`h-8 w-[124px] sm:w-[148px] shrink-0 text-xs font-semibold ${({
                    all: "border-border/50 text-muted-foreground",
                    training: "bg-primary/15 border-primary/40 text-primary",
                    rest: "bg-sky-500/15 border-sky-500/40 text-sky-500",
                  } as Record<string, string>)[dayType]}`}
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
              {kcalBadge}
              {payload.setup.carbCycle && (
                <button type="button"
                  onClick={() => updMealField(mealIdx, { carbCycle: !(m as any).carbCycle } as any)}
                  title="Esta refeição entra no ciclo de carboidratos?"
                  aria-label="Ciclo de carbo nesta refeição"
                  className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${(m as any).carbCycle ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500" : "border-border/50 text-muted-foreground"}`}>
                  <TrendingUp className="w-3.5 h-3.5" /> Ciclo
                </button>
              )}
              {excludedBadge}
              {pairBrokenButton}
            </div>
            <div className="order-2 sm:order-3 flex items-center sm:ml-auto">
              <button
                type="button"
                onClick={() => setOpenMealId(null)}
                className="text-muted-foreground hover:text-primary p-1.5 shrink-0"
                title="Fechar refeição"
                aria-label="Fechar refeição"
                data-testid={`meal-close-${mealIdx}`}
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              {mealMenu}
            </div>
          </div>

          <div className="p-3 sm:p-4 space-y-3">
            {(["carb", "protein", "fat"] as const).map((kind) => {
              const cfg = KIND[kind];
              const hidden = Array.isArray((m as any).hiddenKinds) && (m as any).hiddenKinds.includes(kind);
              if (hidden) return null;
              const opts = getOptsForKind(m, kind);
              const kindCollapsed = isKindCollapsed(mealIdx, kind);
              const visible = visibleOptionIndexes(opts, (i) => !!revealed[optKey(mealId, kind, i)]);
              // Opção vazia escondida (ex.: Opção 2 em branco de protocolos antigos):
              // "+ Opção" mostra ela em vez de criar mais uma.
              const hiddenBlankIdx = opts.findIndex((_, i) => i > 0 && !visible.includes(i));
              const addOrRevealOption = () => {
                if (hiddenBlankIdx > 0) { reveal(optKey(mealId, kind, hiddenBlankIdx)); return; }
                if (opts.length >= 3) return;
                addOption(mealIdx, kind);
                reveal(optKey(mealId, kind, opts.length));
              };
              return (
                <div key={kind} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-2.5 sm:p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => toggleKind(mealIdx, kind)}
                      className={`flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold ${cfg.color} hover:opacity-80`}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${kindCollapsed ? "-rotate-90" : ""}`} />
                      <span className="hidden sm:inline">{cfg.label}</span>
                      <span className="sm:hidden">{cfg.short}</span>
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      {!kindCollapsed && visible.length < 3 && (
                        <button
                          type="button"
                          onClick={addOrRevealOption}
                          className={`text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap ${cfg.color} opacity-70 hover:opacity-100 transition-opacity`}
                          data-testid={`add-option-${mealIdx}-${kind}`}
                        >
                          <Plus className="w-3 h-3" /> Opção {visible.length + 1}
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
                        className="text-[11px] flex items-center gap-1 text-muted-foreground hover:text-destructive opacity-70 hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" /> remover
                      </button>
                    </div>
                  </div>

                  {!kindCollapsed && <div className="space-y-2">
                    {visible.map((optIdx) => {
                      const opt: any = opts[optIdx];
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
                      const notesKey = `${optKey(mealId, kind, optIdx)}|notes`;
                      const showNotes = !!String(opt.notes ?? "").trim() || !!revealed[notesKey];
                      return (
                        <div key={optIdx} className="relative focus-within:z-[60] bg-card rounded-lg border border-border/50 p-2 sm:p-2.5" data-testid={`option-${mealIdx}-${kind}-${optIdx}`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`text-[11px] font-bold shrink-0 px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} border ${cfg.border}`}>Op {optIdx + 1}</span>
                            {/* O aluno não vê este título (vê "Opção principal", "Opção 2"…):
                                o padrão "Opção N" fica escondido pra não repetir o selo. */}
                            <Input
                              value={isDefaultOptionTitle(opt.title) ? "" : (opt.title || "")}
                              onChange={(e) => updOption(mealIdx, kind, optIdx, { title: e.target.value })}
                              placeholder="nome (opcional)"
                              aria-label="Nome da opção"
                              className="h-6 text-[11px] flex-1 min-w-0 bg-transparent border-0 border-b border-dashed border-transparent hover:border-border focus:border-border rounded-none px-1 placeholder:text-muted-foreground/50"
                            />
                            {!showNotes && (
                              <button
                                type="button"
                                onClick={() => reveal(notesKey)}
                                className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground px-1"
                                title="Observação desta opção (o aluno vê)"
                                data-testid={`option-notes-add-${mealIdx}-${kind}-${optIdx}`}
                              >
                                + obs
                              </button>
                            )}
                            {optIdx > 0 && (
                              <button
                                type="button"
                                onClick={() => applyProportionalAdjust(mealIdx, kind, optIdx)}
                                className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border border-dashed border-primary/40 text-primary/80 hover:bg-primary/10 hover:text-primary flex items-center gap-1"
                                title="Calcula a gramagem de cada alimento desta opção proporcionalmente à Opção 1, batendo o mesmo total de kcal/macro"
                              >
                                <Wand2 className="w-3 h-3" /> Ajustar p/ Op 1
                              </button>
                            )}
                            {optIdx > 0 && (
                              <button
                                type="button"
                                onClick={() => { removeOption(mealIdx, kind, optIdx); forgetGroupReveals(mealId, kind); }}
                                className="text-muted-foreground hover:text-destructive p-0.5 shrink-0"
                                title={`Remover a Opção ${optIdx + 1}`}
                                aria-label={`Remover a Opção ${optIdx + 1}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {showNotes && (
                            <Input
                              autoFocus={!String(opt.notes ?? "").trim()}
                              value={opt.notes || ""}
                              onChange={(e) => updOption(mealIdx, kind, optIdx, { notes: e.target.value })}
                              placeholder="Observação (ex: usar nos dias de treino pesado)"
                              aria-label="Observação da opção"
                              className="h-6 text-[11px] w-full bg-transparent border-0 border-b border-dashed rounded-none px-1 mb-2 text-muted-foreground"
                            />
                          )}

                          <div className="space-y-1.5">
                            {items.map((it: any, ii: number) => (
                              <div key={ii} className="relative focus-within:z-[70] bg-background rounded border border-border/40 px-2 py-1.5 space-y-1">
                                {(it as any).optional && (
                                  <span className="text-[11px] text-amber-500 font-bold uppercase tracking-wider">
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
                                      const { grams } = resolveQuantity(it, w);
                                      patch.rawWeight = isFinite(grams) && grams > 0 ? grams : 0;
                                    }
                                    updItem(mealIdx, kind, optIdx, ii, patch);
                                  }}
                                  onRemove={() => rmItem(mealIdx, kind, optIdx, ii)}
                                  // Substituição opcional só pelo menu ⋯ do alimento (decisão 4 da auditoria).
                                  onAddSubstitution={it.substitution ? null : () => updItem(mealIdx, kind, optIdx, ii, { substitution: { name: "", baseName: "", weight: "", rawWeight: 0, cookFactor: 1, isTaco: false } })}
                                  testId={`food-${mealIdx}-${kind}-${optIdx}-${ii}`}
                                  showHousehold={!!payload.setup.showHouseholdMeasures}
                                />

                                {/* Substituição opcional anexada (máx. 1 por alimento) */}
                                {it.substitution && (
                                  <div className="mt-1 ml-2 pl-2.5 border-l-2 border-dashed border-amber-500/40 space-y-1">
                                    <span className="text-[11px] text-amber-500 font-bold uppercase tracking-wider">
                                      ↳ 🔁 Substituição opcional (não soma)
                                    </span>
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
                                          const { grams } = resolveQuantity(sub, w);
                                          patch.rawWeight = isFinite(grams) && grams > 0 ? grams : 0;
                                        }
                                        updSubstitution(mealIdx, kind, optIdx, ii, patch);
                                      }}
                                      onRemove={() => updItem(mealIdx, kind, optIdx, ii, { substitution: undefined })}
                                      removeLabel="Remover substituição"
                                      showHousehold={!!payload.setup.showHouseholdMeasures}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}

                          </div>
                          <button type="button" onClick={() => addItem(mealIdx, kind, optIdx)} className={`mt-1.5 text-[11px] flex items-center gap-1 px-1 ${cfg.color} opacity-60 hover:opacity-100`}><Plus className="w-3 h-3" /> alimento</button>
                          {(optM.kcal > 0 || optM.protein > 0 || optM.carbs > 0 || optM.fat > 0 || optM.fiber > 0) && (
                            <div className="mt-2 pt-2 border-t border-dashed border-border/40 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 text-[11px] tabular-nums" title="Cálculo automático — visível apenas para o coach">
                                <span className="font-bold text-foreground">{Math.round(optM.kcal)} kcal</span>
                                <span className="text-blue-500">{optM.protein.toFixed(1)}p</span>
                                <span className="text-amber-500">{optM.carbs.toFixed(1)}c</span>
                                <span className="text-rose-500">{optM.fat.toFixed(1)}g</span>
                                <span
                                  className={optM.fiberUnknown ? "text-muted-foreground" : "text-emerald-600"}
                                  title={optM.fiberUnknown ? `${optM.fiberUnknown} alimento(s) desta opção sem dado de fibra na base — o valor pode estar subestimado` : "Fibra alimentar"}
                                >
                                  {optM.fiber.toFixed(1)}f{optM.fiberUnknown ? "*" : ""}
                                </span>
                              </div>
                              {delta && (
                                <span
                                  className={`text-[11px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${sevCls[delta.severity]}`}
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
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Macros ocultos:</span>
                {((m as any).hiddenKinds as Array<"carb"|"protein"|"fat">).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      const cur = ((m as any).hiddenKinds as string[]).filter((x) => x !== k);
                      updMealField(mealIdx, { hiddenKinds: cur } as any);
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-dashed border-border/60 text-muted-foreground hover:text-primary hover:border-primary inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {k === "carb" ? "Carbo" : k === "protein" ? "Proteína" : "Gordura"}
                  </button>
                ))}
              </div>
            )}

            {showMealNotes ? (
              <div className="pt-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Observação da refeição</Label>
                <Textarea
                  autoFocus={!String((m as any).notes ?? "").trim()}
                  value={(m as any).notes || ""}
                  onChange={(e) => updMealField(mealIdx, { notes: e.target.value } as any)}
                  placeholder="Ex.: tomar 30 min após o treino · evitar líquidos · café sem açúcar..."
                  className="mt-1 min-h-[60px] text-xs"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => reveal(mealNotesKey)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                data-testid={`meal-notes-add-${mealIdx}`}
              >
                <Plus className="w-3 h-3" /> Observação da refeição
              </button>
            )}
          </div>
          </>
          )}
        </Card>
        )}
        </SortableMealCard>
        );
      })}
      </div>
      </SortableContext>
      </DndContext>
      <Button variant="outline" size="sm" onClick={addMeal} className="w-full">
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
            <DialogTitle>Refeições salvas</DialogTitle>
            <DialogDescription className="text-xs">Clique em uma para adicionar no fim da dieta.</DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">Nenhuma refeição salva ainda — use ⋯ → "Salvar como modelo" em uma refeição.</p>
          ) : (
            <div className="space-y-2 py-2">
              {templates.map((t) => {
                const mm = calcMealMacros(t.meal_data);
                return (
                  <button key={t.id} onClick={() => attachTemplate(t)}
                    className="w-full text-left bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t.kind}</span>
                    </div>
                    <div className="flex gap-2 text-[11px] text-muted-foreground">
                      <span>{Math.round(mm.kcal)} kcal</span>
                      <span>· {Math.round(mm.protein)}p</span>
                      <span>· {Math.round(mm.carbs)}c</span>
                      <span>· {Math.round(mm.fat)}g</span>
                      <span>· {mm.fiber.toFixed(1)}f{mm.fiberUnknown ? "*" : ""}</span>
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

/**
 * Retorno ao vivo da quantidade: mostra o que o sistema ENTENDEU do que o coach digitou
 * ("2 uni" → 2 unidades = 100 g) e os macros do item, incluindo fibra. Substitui o antigo
 * seletor de medida/unidade: a unidade é reconhecida pelo próprio texto.
 */
function QuantityFeedback({ it, showHousehold = false }: { it: any; showHousehold?: boolean }) {
  const linked = it.isTaco === true || it.isIndustrial === true;
  const text = String(it.weight ?? "").trim();

  if (!linked) {
    if (!String(it.baseName || it.name || "").trim()) return null;
    return <p className="pl-[3.9rem] sm:pl-1 text-[11px] text-muted-foreground">Alimento fora da tabela — não entra no cálculo de macros nem de fibra.</p>;
  }
  if (it.optional === true) {
    return <p className="pl-[3.9rem] sm:pl-1 text-[11px] text-muted-foreground">Item opcional (legado) — não soma nos macros.</p>;
  }
  if (!text) {
    const hints = quantityHintsFor(it);
    return (
      <p className="pl-[3.9rem] sm:pl-1 text-[11px] text-muted-foreground">
        Digite g, kg, ml ou uma medida (uni, fatia, colher…){hints.length ? ` · cadastrado: ${hints.join(" · ")}` : ""}
      </p>
    );
  }

  const q = resolveQuantity(it, text);
  if (q.status === "unknown" || q.status === "no-weight") {
    return (
      <p className="pl-[3.9rem] sm:pl-1 flex items-start gap-1 text-[11px] text-amber-600">
        <AlertCircle className="w-3 h-3 mt-px shrink-0" />
        <span>{q.hint}</span>
      </p>
    );
  }

  const m = calcItemMacros({ ...it, rawWeight: q.grams });
  const gramsTxt = `${Math.round(q.grams * 10) / 10} g`;
  const understood = q.isUnit && q.canonicalText ? `${q.canonicalText} = ${gramsTxt}` : q.isUnit && q.label ? `${q.value} ${q.label} = ${gramsTxt}` : gramsTxt;
  // O que o aluno vai ver ao lado dos gramas (só com "Mostrar medidas caseiras ao aluno" ligado).
  const approx = showHousehold && !q.isUnit ? householdApprox(String(it.baseName || it.name || ""), q.grams) : null;
  return (
    <p className="pl-[3.9rem] sm:pl-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 className="w-3 h-3" />{understood}</span>
      {approx && <span className="text-foreground/70" title="O aluno vê esta medida ao lado dos gramas">aluno vê {approx}</span>}
      <span>{Math.round(m.kcal)} kcal</span>
      <span className="text-blue-500">{m.protein.toFixed(1)}p</span>
      <span className="text-amber-500">{m.carbs.toFixed(1)}c</span>
      <span className="text-rose-500">{m.fat.toFixed(1)}g</span>
      {m.fiberUnknown ? (
        <span className="text-amber-600" title="Este alimento não tem fibra cadastrada na base; a fibra do dia não inclui ele.">sem dado de fibra</span>
      ) : (
        <span className="text-emerald-600">{m.fiber.toFixed(1)}f</span>
      )}
    </p>
  );
}

function FoodRow({
  it, onPickTaco, onChangeName, onChangeWeight, onRemove, onAddSubstitution, removeLabel = "Remover alimento", testId, showHousehold = false,
}: {
  it: any;
  kind: "carb" | "protein" | "fat";
  onPickTaco: (t: FoodHit) => void;
  onChangeName: (s: string) => void;
  onChangeWeight: (s: string) => void;
  onRemove: () => void;
  /**
   * Alimento principal: mostra o menu ⋯ (remover + "Adicionar substituição"
   * quando for função; `null` = já tem substituição). Sem a prop (linha da
   * própria substituição), fica só a lixeira.
   */
  onAddSubstitution?: (() => void) | null;
  removeLabel?: string;
  testId?: string;
  showHousehold?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const rawQ = (it.baseName || it.name || "").toString().trim();
  
  // Busca única (lib/foodSearch.ts): ignora acento e pontuação, ranqueia por correspondência,
  // inclui industrializados e já troca "Banana, prata, crua" por "Banana prata (crua)".
  // 20 resultados para caber todas as variações (ex.: feijão carioca/preto, cru/cozido…).
  const matches = useMemo<FoodHit[]>(() => (rawQ.length < 2 ? [] : searchFoods(rawQ, 20)), [rawQ]);

  const showSuggestions = focused && matches.length > 0 && !it.isTaco && !it.isIndustrial;

  // Menu ⋯ do alimento principal (Dieta enxuta): a substituição opcional sai
  // do link fixo embaixo de cada alimento e entra aqui, junto com remover.
  const menu = onAddSubstitution !== undefined ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-primary p-1 shrink-0" title="Ações do alimento" aria-label="Ações do alimento" data-testid={testId ? `${testId}-menu` : undefined}>
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onAddSubstitution && (
          <DropdownMenuItem onClick={onAddSubstitution}>
            <Plus className="w-3.5 h-3.5 mr-2" /> Adicionar substituição
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5 mr-2" /> {removeLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1 shrink-0" title={removeLabel} aria-label={removeLabel}><Trash2 className="w-3.5 h-3.5" /></button>
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 relative" data-testid={testId}>
        <div className="relative flex-1 min-w-0">
          <Input
            aria-label="Alimento"
            value={it.baseName || it.name || ""}
            onChange={(e) => onChangeName(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Nome do alimento (digite para ver sugestões TACO)…"
            className="h-8 text-xs w-full"
          />
          {(() => {
            const selectedName = String(it.baseName || it.name || "");
            const selectedFood = FOOD_CATALOG.find((food) => food.name.toLowerCase() === selectedName.toLowerCase());
            const cutVariants = CUT_VARIANT_PAIRS.find((pair) => pair.some((name) => name.toLowerCase() === selectedName.toLowerCase()));
            return selectedFood && cutVariants ? (
              <div className="flex gap-1 mt-1">
                <select
                  aria-label="Versão do corte"
                  className="h-6 min-w-0 flex-1 bg-background text-[11px] border border-border rounded px-1"
                  value={selectedFood.name}
                  onChange={(e) => {
                    const nextFood = TACO_DATA.find((food) => food.name === e.target.value);
                    if (nextFood) onPickTaco({ ...nextFood, source: "taco" } as FoodHit);
                  }}
                >
                  {cutVariants.map((name) => <option key={name} value={name}>{/sem gordura|s\/ gordura|sem pele/i.test(name) ? "Limpa / sem gordura" : "Comum / com gordura"}</option>)}
                </select>
              </div>
            ) : null;
          })()}
          {showSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
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
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-violet-500/10 text-violet-500 border border-violet-500/30" title={`Industrializado · ${taco.brand}`}>IND</span>
                    )}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${badgeCls}`}>{badgeLabel}</span>
                    {typeof taco.cookFactor === "number" && taco.cookFactor !== 1 && <span className="text-[11px] text-muted-foreground">×{taco.cookFactor}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:w-[240px] sm:shrink-0">
          <label className="sm:hidden text-[11px] text-muted-foreground shrink-0">Quantidade</label>
          <Input
            aria-label="Quantidade"
            value={it.weight ?? ""}
            onChange={(e) => onChangeWeight(e.target.value)}
            onBlur={() => {
              // Ao sair do campo, padroniza a medida reconhecida ("2 uni" → "2 unidades"):
              // a visão do aluno exibe o texto digitado pelo coach, então abreviação não pode vazar para lá.
              if (!(it.isTaco || it.isIndustrial)) return;
              const current = String(it.weight ?? "").trim();
              const q = resolveQuantity(it, current);
              if (q.status === "ok" && q.canonicalText && q.canonicalText !== current) onChangeWeight(q.canonicalText);
            }}
            placeholder={it.isTaco || it.isIndustrial ? "ex: 150g · 2 uni · 3 fatias" : "ex: 8 unidades, 200g…"}
            className="h-8 text-xs flex-1 min-w-0"
          />
          {it.isTaco && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 shrink-0" title="Vinculado à tabela TACO">TACO</span>
          )}
          {it.isIndustrial && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/30 shrink-0" title="Alimento industrializado (rótulo do fabricante)">IND</span>
          )}
          {menu}
        </div>
      </div>
      <QuantityFeedback it={it} showHousehold={showHousehold} />
    </>
  );
}
