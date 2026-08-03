/**
 * ProtocolBuilder.tsx — Master Protocol Builder (Fase 2).
 *
 * CORREÇÕES APLICADAS:
 * [BUG CRÍTICO] TACO_DATA era undefined → crash na aba Dieta
 * Fix: importa TACO_FOODS (nome real exportado) e cria alias TACO_DATA com campo id
 * [BUG] updItem injetava HTML nos dados salvos (spans de peso cru/pronto)
 * Fix: armazena dados limpos; o viewer calcula o display dinamicamente
 * [LAYOUT] Aba Dieta refatorada: Carbo / Proteína / Gordura cada um com seção
 * colorida, opções empilhadas, peso inline na mesma linha do alimento
 * [BUG] Botões Dia Alto/Baixo na aba Semana não respondiam ao clique
 * Fix: botões agora usam data-active + classes CSS corretas, sem Select
 * [FEATURE] addOption: permite adicionar 3ª opção por macro
 * [FEATURE] Observação por opção (campo notes inline)
 * [UI/UX] Adição de cabeçalhos e dicas (placeholders) na tabela de Workouts.
 * [CORREÇÃO] Substituído EvolutionComparisonLazy por AnamnesisViewerLazy no Sheet lateral
 * [BUG] Lista do TACO sendo cortada em alimentos adicionais (overflow-hidden)
 * Fix: removido overflow-hidden e adicionado focus-within:z-50 quando expandido.
 * [BUG] Busca no TACO não encontrava palavras sem acento (ex: FEIJAO) e tinha conflito de Z-Index interno
 * Fix: FoodRow agora utiliza fallback robusto com .normalize("NFD") e camadas z-[60]/z-[70] mapeadas.
 */
import { loadCoachProfile } from "@/lib/prescriptionMemory";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { lazy, Suspense } from "react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Loader2, Save, Plus, Trash2, FileText, Dumbbell, UtensilsCrossed,
  Sparkles, BarChart3, Activity, Pill, TrendingUp,
  CheckCircle2, ChevronDown, Copy, BookmarkPlus, Library, ClipboardList,
  ArrowUp, ArrowDown, Eye, Settings2, History, AlertCircle, GripVertical, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { ExercisePickerInput } from "@/components/coach/ExercisePickerInput";
import {
  ProtocolPayloadSchema, ProtocolPayload, SPLIT_OPTIONS,
  buildBasePayload, makeEmptyExercise, makeEmptyMeal, type SplitValue, MEAL_NAME_PRESETS,
  SUPPLEMENT_OBJECTIVES,
} from "@/lib/protocolSchema";
import {
  buildWeekStrip, cycleCarb, normalizeCarb, CARB_LABEL, CARB_COLOR,
  DAY_KEYS, type CarbLevel,
} from "@/lib/weekCycle";
import ProtocolImportExport from "./ProtocolImportExport";
import ProtocolImportHistory from "./ProtocolImportHistory";
import WorkoutPeriodizationEditor from "./WorkoutPeriodizationEditor";
import StudentProtocolPreview from "./StudentProtocolPreview";
import ProtocolVersionHistoryDialog from "./ProtocolVersionHistoryDialog";
import TemplateLibraryDialog from "./TemplateLibraryDialog";
import CopyProtocolDialog from "./CopyProtocolDialog";
import { MacrosTab } from "./protocol-builder/MacrosTab";
import { GuidelinesTab } from "./protocol-builder/GuidelinesTab";
import { WorkoutsTab } from "./protocol-builder/WorkoutsTab";
import { DietTab } from "./protocol-builder/DietTab";
import { calcMealMacros, calcDayMacros, tacoGroupToKind, parseWeightString, optionMacros, compareOptions, type SubstitutionSeverity } from "@/lib/macroCalc";
import {
  detectProtocolChanges,
  summarizeProtocolChanges,
  type ProtocolChange,
} from "@/lib/protocolChangeDetector";
import { mergeProtocolChanges } from "@/lib/protocolChangeMerge";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { TACO_FOODS } from "@/data/tacoFoods";
const TACO_DATA = TACO_FOODS.map((t, i) => ({ ...t, id: String(i), cookFactor: t.cookFactor ?? 1 }));
import { searchFoods, type FoodHit } from "@/lib/foodSearch";
import { Private } from "@/components/coach/PrivacyMode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface Props {
  studentId: string;
  studentName: string;
}

const CheckinFeedbackPanel = lazy(() => import("./CheckinFeedbackPanel"));

interface ProtocolRow {
  id: string;
  student_id: string;
  coach_id: string | null;
  name: string;
  is_template: boolean;
  payload: ProtocolPayload;
  draft_payload: ProtocolPayload | null;
  active: boolean | null;
  updated_at: string;
}

/** Rótulos humanos da triagem gerada por `protocol-renewal-draft`. */
const RENEWAL_ACTION_LABEL: Record<string, string> = {
  nenhuma_alteracao: "Sem alteração no protocolo",
  orientar_coach: "Orientar o aluno",
  investigar_antes: "Investigar antes de ajustar",
  recomendar_exame: "Recomendar exame",
  reduzir_carga_treino: "Reduzir carga de treino",
  acompanhar_mais_um_ciclo: "Acompanhar mais um ciclo",
  ajustar: "Ajuste sugerido no protocolo",
};

function computeCompletion(payload: ProtocolPayload | null) {
  if (!payload) return { macros: false, guidelines: false, workouts: false, diet: false, cycle: false };
  return {
    macros: (payload.macros?.calories ?? 0) > 0 && (payload.macros?.protein ?? 0) > 0,
    guidelines: Object.values(payload.guidelines ?? {}).some(
      (v) => typeof v === "string" && v.trim().length > 10
    ),
    workouts: (payload.workouts ?? []).some((d: any) => (d.exercises ?? []).length > 0),
    diet: (payload.meals ?? []).some((m: any) => (m.options?.[0]?.items ?? []).length > 0),
    cycle: payload.setup?.carbCycle
      ? Object.keys((payload as any).carbCycle ?? {}).length > 0
      : (payload.workouts ?? []).length > 0,
  };
}

export default function ProtocolBuilder({ studentId, studentName }: Props) {
  const qc = useQueryClient();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [payload, setPayload] = useState<ProtocolPayload | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  // Snapshot IMUTÁVEL do protocolo como estava quando a página carregou.
  // Usado pelo comparador de mudanças (protocol_change_events) para diffar
  // "antes x depois" sem ser afetado por revalidações da query em background.
  const previousPayloadRef = useRef<any>(null);
  const previousActiveRef = useRef<boolean | null>(null);
  const updatePayload = (p: ProtocolPayload) => {
    setPayload(p);
    setIsDirty(true);
  };
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSplit, setSetupSplit] = useState<SplitValue>("ABC");
  const [setupMeals, setSetupMeals] = useState(5);
  const [setupCarbCycle, setSetupCarbCycle] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"macros" | "guidelines" | "workouts" | "diet">("macros");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const ENABLE_AI_INITIAL_DRAFT = true;
  const [aiSuggestion, setAiSuggestion] = useState<{
    calories: number; protein: number; carbs: number; fat: number; water: number; goal: string; rationale: string;
  } | null>(null);
  const [loadingAiSuggestion, setLoadingAiSuggestion] = useState(false);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalText, setRenewalText] = useState("");
  const [renewalSuggestions, setRenewalSuggestions] = useState<Array<{
    id: string;
    categoria: "treino" | "dieta" | "refeicao" | "diretrizes";
    exercicioId?: string;
    refeicaoIndex?: number;
    optionKey?: string;
    itemRef?: string;
    campo: string;
    alvo: string;
    valorAtual: string;
    valorSugerido: string;
    motivo: string;
  }>>([]);
  const [renewalAction, setRenewalAction] = useState<{ acao: string; motivo: string; estrategia: string } | null>(null);
  const [renewalAccepted, setRenewalAccepted] = useState<Set<string>>(new Set());
  const [renewalEdited, setRenewalEdited] = useState<Record<string, string>>({});
  const [showRenewalSuggestions, setShowRenewalSuggestions] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<Date | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payloadRef = useRef<ProtocolPayload | null>(null);
  useEffect(() => { payloadRef.current = payload; }, [payload]);

  const tabLabel: Record<typeof activeTab, string> = {
    macros: "Macros",
    guidelines: "Diretrizes",
    workouts: "Treino",
    diet: "Dieta",
  } as const;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {   const id = data.session?.user?.id ?? null;   setCoachId(id);   loadCoachProfile(id); });
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

  /**
   * Objetivo sugerido a partir da Anamnese (`meta_prioridade`). Só é usado
   * como valor inicial de um protocolo novo — o coach pode trocar livremente.
   */
  const { data: suggestedGoal } = useQuery({
    queryKey: ["protocol-builder-anamnesis-goal", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await sb
        .from("anamnesis")
        .select("payload")
        .eq("student_id", studentId)
        .maybeSingle();
      const prio = String((data?.payload as Record<string, unknown> | undefined)?.meta_prioridade ?? "");
      const map: Record<string, string> = {
        "perda de gordura": "emagrecimento",
        "hipertrofia": "hipertrofia",
        "recomposição": "recomposicao",
        "recomposicao": "recomposicao",
        "performance": "performance",
        "saúde": "manter",
        "saude": "manter",
      };
      return map[prio.trim().toLowerCase()] ?? null;
    },
  });

  useEffect(() => {
    if (existing) {
      setProtocolId(existing.id);
      setName(existing.name || `Protocolo — ${studentName}`);
      setActive(existing.active ?? true);
      // Se houver rascunho salvo, retomar dele; senão, usar o payload publicado.
      const draftParsed = existing.draft_payload
        ? ProtocolPayloadSchema.safeParse(existing.draft_payload)
        : null;
      const publishedParsed = ProtocolPayloadSchema.safeParse(existing.payload);
      if (draftParsed && draftParsed.success) {
        setPayload(draftParsed.data);
        setHasDraft(true);
      } else {
        setPayload(publishedParsed.success
          ? publishedParsed.data
          : buildBasePayload({ split: "ABC", mealsCount: 5, carbCycle: false }));
        setHasDraft(false);
      }
      // Só grava o snapshot na primeira vez que carregamos este protocolo.
      // Ignora revalidações posteriores para não corromper a comparação.
      if (previousPayloadRef.current == null) {
        previousPayloadRef.current = existing.payload ?? null;
        previousActiveRef.current = existing.active ?? true;
      }
    } else if (!isLoading && existing === null) {
      setSetupOpen(true);
    }
  }, [existing, isLoading, studentName]);

  const isEditMode = !!protocolId;

  // ─── Autosave em draft_payload ─────────────────────────────────────────
  // Só roda em modo edição de um protocolo já existente. Nunca toca em `payload`.
  async function performAutosave() {
    if (!isEditMode || !protocolId) return;
    const current = payloadRef.current;
    if (!current) return;
    setIsAutosaving(true);
    try {
      const parsed = ProtocolPayloadSchema.parse(current);
      const { error } = await sb
        .from("protocols")
        .update({ draft_payload: parsed })
        .eq("id", protocolId);
      if (error) throw error;
      setLastAutosavedAt(new Date());
      setHasDraft(true);
    } catch (e) {
      console.error("[autosave] falhou", e);
    } finally {
      setIsAutosaving(false);
    }
  }

  const flushAutosave = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      performAutosave();
    }
  };

  // Agenda autosave debounced (1.5s) sempre que o payload muda em modo edição.
  useEffect(() => {
    if (!isDirty || !isEditMode || !protocolId) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      performAutosave();
    }, 1500);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, isDirty, isEditMode, protocolId]);

  // Flush ao trocar de aba.
  const handleTabChange = (v: string) => {
    flushAutosave();
    setActiveTab(v as typeof activeTab);
  };

  async function discardDraft() {
    if (!protocolId || !existing) return;
    try {
      const { error } = await sb
        .from("protocols")
        .update({ draft_payload: null })
        .eq("id", protocolId);
      if (error) throw error;
      const publishedParsed = ProtocolPayloadSchema.safeParse(existing.payload);
      if (publishedParsed.success) setPayload(publishedParsed.data);
      setHasDraft(false);
      setIsDirty(false);
      setLastAutosavedAt(null);
      toast.success("Rascunho descartado — voltamos à última versão publicada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao descartar rascunho");
    }
  }

  // Lista de alterações pendentes (rascunho vs. último publicado).
  const pendingChanges: ProtocolChange[] = useMemo(() => {
    if (!payload || !isEditMode) return [];
    if (previousActiveRef.current === false) return [];
    try {
      return detectProtocolChanges(previousPayloadRef.current, payload) ?? [];
    } catch {
      return [];
    }
  }, [payload, isEditMode]);

  async function suggestMacrosWithAI() {
    if (!studentId) return;
    setLoadingAiSuggestion(true);
    try {
      const { data, error } = await sb.functions.invoke("protocol-initial-draft", { body: { studentId } });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.reason === "sem_anamnese" ? "Aluno ainda não tem anamnese preenchida" : "Não foi possível gerar sugestão agora");
        return;
      }
      setAiSuggestion(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar sugestão agora");
    } finally {
      setLoadingAiSuggestion(false);
    }
  }

  async function openRenewalSuggestion() {
    if (!studentId || !protocolId) return;
    setRenewalOpen(true);
    setRenewalLoading(true);
    setRenewalText("");
    setRenewalSuggestions([]);
    setRenewalAccepted(new Set());
    setRenewalEdited({});
    setRenewalAction(null);
    setShowRenewalSuggestions(false);
    try {
      // O novo contrato é por check-in: sempre o mais recente do aluno.
      const { data: lastCheckin } = await sb
        .from("check_ins")
        .select("id")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastCheckin?.id) throw new Error("Aluno ainda não enviou nenhum check-in");
      const { data, error } = await sb.functions.invoke("protocol-renewal-draft", { body: { checkInId: lastCheckin.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao gerar sugestão");
      setRenewalText(data.resumo || "");
      setRenewalSuggestions(data.sugestoes || []);
      setRenewalAction({
        acao: String(data.acao ?? ""),
        motivo: String(data.motivo_acao ?? ""),
        estrategia: String(data.estrategia_identificada ?? ""),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar sugestão agora");
      setRenewalOpen(false);
    } finally {
      setRenewalLoading(false);
    }
  }

  function applyRenewalSuggestions() {
    if (renewalAccepted.size === 0 || !payload) return;
    const next = JSON.parse(JSON.stringify(payload)) as typeof payload;
    let count = 0;
    for (const s of renewalSuggestions) {
      if (!renewalAccepted.has(s.id)) continue;
      const valor = renewalEdited[s.id] ?? s.valorSugerido;
      if (s.categoria === "treino" && s.exercicioId) {
        for (const w of next.workouts) {
          const ex = (w.exercises as any[]).find((e) => e.__id === s.exercicioId);
          if (ex) { ex[s.campo] = valor; count++; break; }
        }
      } else if (s.categoria === "dieta") {
        next.macros = { ...next.macros, [s.campo]: Number(valor) || 0 };
        count++;
      } else if (s.categoria === "refeicao" && typeof s.refeicaoIndex === "number") {
        // Ajuste cirúrgico: só a refeição/opção que a IA identificou.
        const meal = (next.meals as any[])?.[s.refeicaoIndex];
        if (!meal) continue;
        if (s.campo === "horario") {
          meal.time = valor;
          count++;
        } else if (s.campo === "quantidade" && s.itemRef) {
          const opt = (meal.options as any[] | undefined)?.find(
            (o) => `${o?.kind ?? ""}::${String(o?.title ?? "").trim()}` === s.optionKey
          );
          const itemIndex = Number(String(s.itemRef).split("|")[2]);
          const item = opt?.items?.[itemIndex];
          if (item) {
            // Mesmo contrato de atualização que a edição manual de peso já usa
            // (onChangeWeight de FoodRow) — mantém rawWeight coerente pra itens TACO.
            item.weight = valor;
            if (item.isTaco || item.isIndustrial) {
              const tacoRef = TACO_FOODS.find(
                (t) => t.name.toLowerCase() === String(item.baseName || item.name).toLowerCase()
              );
              const unitW = tacoRef && typeof (tacoRef as any).unitWeight === "number" ? (tacoRef as any).unitWeight : 50;
              const { grams } = parseWeightString(valor, unitW);
              item.rawWeight = isFinite(grams) && grams > 0 ? grams : 0;
            }
            count++;
          }
        } else {
          // trocar_alimento / redistribuir_macro: ainda não é um valor que dá pra
          // aplicar sozinho num campo (é troca de alimento ou reorganização) — registra
          // como observação na refeição (campo que existe e é exibido), não num campo
          // inexistente que o schema descarta silenciosamente.
          meal.notes = [meal.notes, `IA: ${valor}`].filter(Boolean).join(" · ");
          count++;
        }
      } else if (s.categoria === "diretrizes") {
        next.guidelines = { ...next.guidelines, [s.campo]: valor };
        count++;
      }
    }
    updatePayload(next);
    toast.success(`${count} alteração(ões) aplicada(s) — revise e clique em Salvar/Atualizar protocolo.`);
    setRenewalOpen(false);
  }

  function generateBase() {
    const base = buildBasePayload({ split: setupSplit, mealsCount: setupMeals, carbCycle: setupCarbCycle });
    // Pré-preenche o objetivo com o que o aluno respondeu na Anamnese.
    if (suggestedGoal) base.macros = { ...base.macros, goal: suggestedGoal };
    if (aiSuggestion) {
      base.macros = {
        calories: aiSuggestion.calories,
        protein: aiSuggestion.protein,
        carbs: aiSuggestion.carbs,
        fat: aiSuggestion.fat,
        water: aiSuggestion.water,
        goal: aiSuggestion.goal,
      };
    }
    updatePayload(base);
    setName(`Protocolo — ${studentName}`);
    setActive(true);
    setProtocolId(null);
    setSetupOpen(false);
    setAiSuggestion(null);
  }

  async function save(opts: { asDraft?: boolean } = {}) {
    if (!payload) return;
    if (!name.trim()) { toast.error("Dê um nome ao protocolo"); return; }
    if (!opts.asDraft && !active) {
      toast.error("Protocolo está Inativo — ative no topo antes de publicar.");
      return;
    }
    // Cancela qualquer autosave em voo/pendente para não colidir com o publish.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const publishActive = opts.asDraft ? false : active;
    setSaving(true);
    try {
      const parsed = ProtocolPayloadSchema.parse(payload);
      if (isEditMode && protocolId) {
        // Snapshot da versão publicada antes de sobrescrever — só em publicação real.
        if (!opts.asDraft) {
          const { data: current, error: readErr } = await sb
            .from("protocols")
            .select("payload")
            .eq("id", protocolId)
            .maybeSingle();
          if (readErr) throw readErr;
          if (current?.payload) {
            const { data: maxRow } = await sb
              .from("protocol_versions")
              .select("version")
              .eq("protocol_id", protocolId)
              .order("version", { ascending: false })
              .limit(1)
              .maybeSingle();
            const nextVersion = ((maxRow?.version as number | undefined) ?? 0) + 1;
            const { error: insErr } = await sb
              .from("protocol_versions")
              .insert({
                protocol_id: protocolId,
                student_id: studentId,
                coach_id: coachId,
                version: nextVersion,
                payload: current.payload,
              });
            if (insErr) throw insErr;
          }
        }
        const updateFields: Record<string, unknown> = {
          name,
          payload: parsed,
          active: publishActive,
          updated_at: new Date().toISOString(),
        };
        if (!opts.asDraft) updateFields.draft_payload = null;
        const { error } = await sb.from("protocols").update(updateFields).eq("id", protocolId);
        if (error) throw error;
        if (!opts.asDraft) setHasDraft(false);
        toast.success(opts.asDraft ? "Rascunho salvo — aluno ainda não vê esta versão" : "Protocolo atualizado");
      } else {
        const { data, error } = await sb.from("protocols").insert({ student_id: studentId, coach_id: coachId, name, is_template: false, payload: parsed, active: publishActive }).select().single();
        if (error) throw error;
        setProtocolId(data.id);
        toast.success(opts.asDraft ? "Rascunho criado — aluno ainda não vê esta versão" : "Protocolo criado");
      }
      if (!opts.asDraft) setActive(publishActive);
      if (coachId && !opts.asDraft) {
        try {
          const goalMap: Record<string, string> = { hipertrofia: "hipertrofia", emagrecimento: "emagrecer", emagrecer: "emagrecer", recomposicao: "recomposicao", performance: "manter", manter: "manter" };
          const safeGoal = goalMap[(parsed.macros?.goal ?? "manter").toLowerCase()] ?? "manter";
          const { error: planError } = await sb.from("coach_plans").upsert({ student_id: studentId, coach_id: coachId, diet_strategy_json: parsed, workout_periodization_json: parsed, base_calories: parsed.macros?.calories ?? 2200, base_protein_g: parsed.macros?.protein ?? 160, base_carbs_g: parsed.macros?.carbs ?? 250, base_fat_g: parsed.macros?.fat ?? 55, calories: parsed.macros?.calories ?? 2200, protein_g: parsed.macros?.protein ?? 160, carbs_g: parsed.macros?.carbs ?? 250, fat_g: parsed.macros?.fat ?? 55, water_l: parsed.macros?.water ?? 2.5, goal: safeGoal, updated_at: new Date().toISOString() }, { onConflict: "coach_id,student_id" });
          if (planError) toast.error("Protocolo salvo, mas sincronização com aluno falhou", { description: planError.message, duration: 9000 });
          else toast.success("Dieta e Treino sincronizados com o aluno");
        } catch (syncErr) { console.error(syncErr); }
      }
      // ─── Geração best-effort de eventos de mudança do protocolo ───
      // Só roda em UPDATE (protocolo já existia), publicação real (não rascunho),
      // e com o protocolo efetivamente ativo depois do save. Falhas aqui não
      // desfazem o UPDATE em `protocols` e não bloqueiam o fluxo.
      if (isEditMode && protocolId && coachId && !opts.asDraft && publishActive) {
        try {
          const wasInactive = previousActiveRef.current === false;
          const raw = wasInactive
            ? []
            : detectProtocolChanges(previousPayloadRef.current, parsed);
          const changes: ProtocolChange[] = summarizeProtocolChanges({
            wasInactive,
            changes: raw,
          });
          if (changes.length > 0) {
            const { data: openRow } = await sb
              .from("protocol_change_events")
              .select("id, changes")
              .eq("protocol_id", protocolId)
              .is("seen_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (openRow) {
              const existingArr: ProtocolChange[] = Array.isArray(openRow.changes) ? openRow.changes : [];
              const merged = mergeProtocolChanges(existingArr, changes);
              const { error: updErr } = await sb
                .from("protocol_change_events")
                .update({ changes: merged })
                .eq("id", openRow.id);
              if (updErr) throw updErr;
            } else {
              const { error: insErr } = await sb
                .from("protocol_change_events")
                .insert({
                  protocol_id: protocolId,
                  student_id: studentId,
                  coach_id: coachId,
                  changes,
                });
              if (insErr) throw insErr;
            }
          }
          // Atualiza o snapshot para que edições subsequentes na MESMA sessão
          // (sem recarregar a página) sejam diffadas contra o estado publicado.
          previousPayloadRef.current = parsed;
          previousActiveRef.current = publishActive;
        } catch (evtErr) {
          console.error("[protocol_change_events] best-effort falhou", evtErr);
        }
      }
      if (coachId) {         void sb.rpc("refresh_coach_ai_profile", { p_coach_id: coachId }).then(({ error }) => {           if (error) console.warn("refresh_coach_ai_profile falhou (não bloqueia o save)", error);         });       }       qc.invalidateQueries({ queryKey: ["protocol-builder", studentId] });
      qc.invalidateQueries({ queryKey: ["protocol", studentId] });
      qc.invalidateQueries({ queryKey: ["diet-strategy", studentId] });
      qc.invalidateQueries({ queryKey: ["workout-plan", studentId] });
      qc.invalidateQueries({ queryKey: ["coach-plan-presence", studentId] });
      qc.invalidateQueries({ queryKey: ["plan-macros", studentId] });
      setIsDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function saveAsTemplate() {
    if (!payload) { toast.error("Sem protocolo para salvar"); return; }
    const tplName = window.prompt("Nome do template", name || "Template");
    if (!tplName?.trim()) return;
    setSaving(true);
    try {
      const parsed = ProtocolPayloadSchema.parse(payload);
      const { error } = await sb.from("protocols").insert({
        student_id: studentId,
        coach_id: coachId,
        name: tplName.trim(),
        is_template: true,
        payload: parsed,
        active: false,
      });
      if (error) throw error;
      toast.success("Template salvo na sua biblioteca");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar template");
    } finally { setSaving(false); }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-border p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          {/* Top row: Ativo + Modo Avançado left, student chip right */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {payload && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Switch checked={active} onCheckedChange={setActive} id="active-top" />
                  <Label htmlFor="active-top" className="text-xs cursor-pointer select-none">
                    {active ? "Ativo" : "Inativo"}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                      >
                        <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Modo Avançado
                        <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-80" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-60 p-1">
                      <div className="px-2 py-1.5">
                        <ProtocolImportExport payload={payload} studentName={studentName} onImport={(p) => { updatePayload(p); setProtocolId(protocolId); }} />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 max-w-[55%] sm:max-w-[40%] shrink-0">
              <div className="min-w-0 text-right">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none mb-0.5">Aluno</p>
                <Private as="p" className="text-sm font-semibold text-foreground truncate">{studentName}</Private>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold uppercase text-xs shrink-0">
                <Private>{studentName.slice(0, 2)}</Private>
              </div>
            </div>
          </div>

          {/* Name input + ações (cabeçalho enxuto: 2 ações diretas + menu) */}
          {payload && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome do protocolo</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => setPreviewOpen(true)}
                  title="Ver como aluno"
                >
                  <Eye className="w-3.5 h-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Ver como aluno</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => setConsultOpen(true)}
                  title="Abrir anamnese do aluno"
                >
                  <ClipboardList className="w-3.5 h-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Anamnese</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-9 text-xs" title="Mais ações">
                      <MoreHorizontal className="w-3.5 h-3.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">Mais</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => setSetupOpen(true)} className="text-xs">
                      <Sparkles className="w-3.5 h-3.5 mr-2" /> Recriar base
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setLibraryOpen(true)} className="text-xs">
                      <Library className="w-3.5 h-3.5 mr-2" /> Biblioteca de templates
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCopyOpen(true)} className="text-xs">
                      <Copy className="w-3.5 h-3.5 mr-2" /> Copiar para outro aluno
                    </DropdownMenuItem>
                    {isEditMode && (
                      <DropdownMenuItem onSelect={() => setHistoryOpen(true)} className="text-xs">
                        <History className="w-3.5 h-3.5 mr-2" /> Histórico de versões
                      </DropdownMenuItem>
                    )}
                    {isEditMode && (
                      <DropdownMenuItem onSelect={openRenewalSuggestion} className="text-xs">
                        <RefreshCw className="w-3.5 h-3.5 mr-2" /> Renovar ciclo (IA)
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>
      </Card>

      {isEditMode && hasDraft && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground/90">
              Você está editando um <strong>rascunho não publicado</strong>. O aluno continua vendo a última versão publicada.
            </p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={discardDraft}>
            Descartar rascunho
          </Button>
        </Card>
      )}

      {!payload ? (
        <>
          <Card className="bg-card/60 border-border p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Configure a base do protocolo.</p>
            <Button onClick={() => setSetupOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Gerar Base</Button>
          </Card>
          <ProtocolImportHistory />
        </>
      ) : (
        <>
          <div className={cn("relative", !active && "pointer-events-none")}>
            {!active && (
              <div className="absolute inset-0 z-30 bg-background/55 backdrop-blur-[1px] rounded-lg flex items-start justify-center pt-8 pointer-events-none">
                <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/40 shadow">
                  Protocolo inativo — invisível para o aluno
                </span>
              </div>
            )}
            <div className={cn("space-y-4", !active && "opacity-60 saturate-50")}>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            {(() => {
              const completion = computeCompletion(payload);
              const flags = [completion.macros, completion.guidelines, completion.workouts, completion.diet];
              const doneCount = flags.filter(Boolean).length;
              return doneCount < 4 ? (
                <div className="mb-2 px-1 text-[11px] text-muted-foreground">
                  {doneCount} de 4 seções preenchidas
                </div>
              ) : null;
            })()}
            <TabsList className="flex w-full overflow-x-auto gap-0 h-auto p-1">
              {(() => {
                const c = computeCompletion(payload);
                const tabs: Array<{ v: "macros"|"guidelines"|"workouts"|"diet"; label: string; icon: JSX.Element; done: boolean }> = [
                  { v: "macros",     label: "Macros",     icon: <BarChart3 className="w-3.5 h-3.5 mr-1" />,        done: c.macros },
                  { v: "guidelines", label: "Diretrizes", icon: <FileText className="w-3.5 h-3.5 mr-1" />,         done: c.guidelines },
                  { v: "workouts",   label: "Treino",     icon: <Dumbbell className="w-3.5 h-3.5 mr-1" />,         done: c.workouts },
                  { v: "diet",       label: "Dieta",      icon: <UtensilsCrossed className="w-3.5 h-3.5 mr-1" />,  done: c.diet },
                ];
                return tabs.map((t) => (
                  <TabsTrigger key={t.v} value={t.v} className="shrink-0">
                    {t.icon}{t.label}
                    {t.done && <CheckCircle2 className="w-3 h-3 ml-1 text-emerald-500" />}
                  </TabsTrigger>
                ));
              })()}
            </TabsList>
            <TabsContent value="macros" className="mt-4"><MacrosTab payload={payload} setPayload={updatePayload} /></TabsContent>
            <TabsContent value="guidelines" className="mt-4"><GuidelinesTab payload={payload} setPayload={updatePayload} /></TabsContent>
            <TabsContent value="workouts" className="mt-4"><WorkoutsTab payload={payload} setPayload={updatePayload} coachId={coachId} onOpenTemplateLibrary={() => setLibraryOpen(true)} /></TabsContent>
            <TabsContent value="diet" className="mt-4"><DietTab payload={payload} setPayload={updatePayload} /></TabsContent>
          </Tabs>

            </div>
          </div>

          <div className="sticky bottom-4 z-40 space-y-2">
            {isEditMode && pendingChanges.length > 0 && (
              <Card className="bg-background/95 backdrop-blur border-primary/30 shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPendingOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary/5 transition"
                >
                  <AlertCircle className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold flex-1">
                    {pendingChanges.length} {pendingChanges.length === 1 ? "alteração pendente" : "alterações pendentes"}
                  </span>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", pendingOpen && "rotate-180")} />
                </button>
                {pendingOpen && (
                  <ul className="border-t border-border max-h-52 overflow-y-auto divide-y divide-border">
                    {pendingChanges.slice(0, 30).map((c, i) => (
                      <li key={i} className="px-3 py-2 text-[11px]">
                        <div className="font-medium text-foreground/90">{c.label}</div>
                        {c.detail && <div className="text-muted-foreground mt-0.5">{c.detail}</div>}
                      </li>
                    ))}
                    {pendingChanges.length > 30 && (
                      <li className="px-3 py-2 text-[11px] italic text-muted-foreground">
                        + {pendingChanges.length - 30} outras alterações…
                      </li>
                    )}
                  </ul>
                )}
              </Card>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {isEditMode && (
                <span className="text-[10px] text-muted-foreground px-1" aria-live="polite">
                  {isAutosaving
                    ? "Salvando…"
                    : lastAutosavedAt
                      ? `Salvo às ${lastAutosavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                      : hasDraft ? "Rascunho retomado" : ""}
                </span>
              )}
              <Button onClick={() => save()} disabled={saving || !active} size="lg" className="shadow-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {isEditMode ? "Atualizar protocolo" : "Criar protocolo"}
              </Button>
            </div>
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
            {ENABLE_AI_INITIAL_DRAFT && (
              !aiSuggestion ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={suggestMacrosWithAI}
                  disabled={loadingAiSuggestion}
                >
                  {loadingAiSuggestion ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Sugerir macros com IA (baseado na anamnese)
                </Button>
              ) : (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-primary">Sugestão da IA:</p>
                  <p className="text-xs text-foreground/90">
                    {aiSuggestion.calories} kcal · P {aiSuggestion.protein}g · C {aiSuggestion.carbs}g · G {aiSuggestion.fat}g · Água {aiSuggestion.water}L
                  </p>
                  <p className="text-[11px] text-muted-foreground">{aiSuggestion.rationale}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAiSuggestion(null)}
                    className="text-[11px] h-6 px-2"
                  >
                    Descartar sugestão
                  </Button>
                </div>
              )
            )}
            <Button onClick={generateBase} className="w-full"><Sparkles className="w-4 h-4 mr-2" /> Gerar Base</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renewalOpen} onOpenChange={setRenewalOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sugestão de renovação de ciclo (IA)</DialogTitle>
            <DialogDescription className="text-xs">
              Rascunho pra você revisar — só aplica o que você marcar abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {renewalLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap text-foreground/90">{renewalText}</p>

                {renewalAction && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1">
                    <p className="text-xs font-semibold text-emerald-700">
                      Triagem: {RENEWAL_ACTION_LABEL[renewalAction.acao] ?? renewalAction.acao}
                    </p>
                    {renewalAction.motivo && <p className="text-[11px] text-foreground/80">{renewalAction.motivo}</p>}
                    {renewalAction.estrategia && (
                      <p className="text-[11px] text-muted-foreground">Estratégia respeitada: {renewalAction.estrategia}</p>
                    )}
                    {renewalSuggestions.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">Nenhum ajuste de protocolo sugerido agora.</p>
                    )}
                  </div>
                )}

                {renewalSuggestions.length > 0 && !showRenewalSuggestions && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowRenewalSuggestions(true)}
                  >
                    Ver alterações sugeridas ({renewalSuggestions.length})
                  </Button>
                )}

                {showRenewalSuggestions && renewalSuggestions.length > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setRenewalAccepted(new Set(renewalSuggestions.map((s) => s.id)))}
                    >
                      Selecionar todas
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:underline"
                      onClick={() => setRenewalAccepted(new Set())}
                    >
                      Limpar seleção
                    </button>
                  </div>
                )}

                {showRenewalSuggestions && (["treino", "dieta", "refeicao", "diretrizes"] as const).map((cat) => {
                  const items = renewalSuggestions.filter((s) => s.categoria === cat);
                  if (items.length === 0) return null;
                  const Icon = cat === "treino" ? Dumbbell : cat === "diretrizes" ? FileText : UtensilsCrossed;
                  const label =
                    cat === "treino" ? "Treino" : cat === "dieta" ? "Macros" : cat === "refeicao" ? "Refeições" : "Diretrizes";
                  return (
                    <div key={cat} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </div>
                      {items.map((s) => (
                        <div key={s.id} className="flex gap-2 items-start p-2 rounded-md border border-border/60 bg-background/40">
                          <Checkbox
                            className="mt-1"
                            checked={renewalAccepted.has(s.id)}
                            onCheckedChange={(checked) => {
                              setRenewalAccepted((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(s.id); else next.delete(s.id);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 space-y-1">
                            <p className="text-xs font-medium">{s.alvo}</p>
                            {s.categoria === "diretrizes" ? (
                              <Textarea
                                className="text-xs min-h-[72px]"
                                value={renewalEdited[s.id] ?? s.valorSugerido}
                                onChange={(e) => setRenewalEdited((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              />
                            ) : s.categoria === "refeicao" && s.campo !== "quantidade" ? (
                              <Textarea
                                className="text-xs min-h-[72px]"
                                value={renewalEdited[s.id] ?? s.valorSugerido}
                                onChange={(e) => setRenewalEdited((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              />
                            ) : (
                              <div className="flex items-center gap-2 text-xs">
                                {s.valorAtual && <span className="text-muted-foreground line-through">{s.valorAtual}</span>}
                                <Input
                                  className="h-7 text-xs w-28"
                                  value={renewalEdited[s.id] ?? s.valorSugerido}
                                  onChange={(e) => setRenewalEdited((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                />
                              </div>
                            )}
                            <p className="text-[11px] text-muted-foreground">{s.motivo}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {showRenewalSuggestions && renewalSuggestions.length > 0 && (
            <Button
              type="button"
              onClick={applyRenewalSuggestions}
              disabled={renewalAccepted.size === 0}
              className="w-full"
            >
              Aplicar selecionadas ({renewalAccepted.size})
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {consultOpen && (
        <Suspense fallback={null}>
          <CheckinFeedbackPanel
            studentId={studentId}
            studentName={studentName}
            open={consultOpen}
            onClose={() => setConsultOpen(false)}
          />
        </Suspense>
      )}

      {payload && (
        <StudentProtocolPreview
          key={`${activeTab}-${previewOpen ? "open" : "closed"}`}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          payload={payload}
          studentName={studentName}
          section={activeTab}
        />
      )}

      <ProtocolVersionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        protocolId={protocolId}
        protocolName={name}
        onRestore={(p) => {
          updatePayload(p);
        }}
      />

      <TemplateLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        coachId={coachId}
        payload={payload}
        setPayload={updatePayload}
        protocolName={name}
      />

      <CopyProtocolDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        coachId={coachId}
        payload={payload}
        sourceStudentId={studentId}
        protocolName={name}
      />
    </div>
  );
}

