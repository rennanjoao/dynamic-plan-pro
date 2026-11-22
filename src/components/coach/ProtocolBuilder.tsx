import { lazyWithRetry } from "@/lib/lazyWithRetry";
const ProtocolHistoryDialog = lazyWithRetry(() => import("@/components/coach/ProtocolHistoryDialog"));
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
import { loadCoachProfile, reloadCoachProfile } from "@/lib/prescriptionMemory";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { queryKeys } from "@/lib/queryKeys";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { lazy, Suspense } from "react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Loader2, Save, Plus, Trash2, FileText, Dumbbell, UtensilsCrossed,
  Sparkles, BarChart3, Activity, Pill, TrendingUp,
  CheckCircle2, Copy, BookmarkPlus, Library, ClipboardList,
  ArrowUp, ArrowDown, Eye, Settings2, History, GripVertical, RefreshCw
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
import TemplateLibraryDialog from "./TemplateLibraryDialog";
import CopyProtocolDialog from "./CopyProtocolDialog";
import { buildSaveProtocolArgs } from "@/lib/protocolSave";
import { pruneOrphanWeekDays } from "@/lib/weekDaysOps";
import { MacrosTab } from "./protocol-builder/MacrosTab";
import { GuidelinesTab } from "./protocol-builder/GuidelinesTab";
import { WorkoutsTab, WorkoutModelsMenu } from "./protocol-builder/WorkoutsTab";
import { BusyWeekInlineEditor, type BusyWeekInlineHandle } from "./busy-week/BusyWeekInlineEditor";
import { useBusyWeekAssignments } from "@/hooks/useBusyWeek";
import { DietTab } from "./protocol-builder/DietTab";
import { PublishBar } from "./protocol-builder/PublishBar";
import { useConfirm } from "@/components/ConfirmProvider";
import { calcMealMacros, calcDayMacros, tacoGroupToKind, parseWeightString, optionMacros, compareOptions, type SubstitutionSeverity } from "@/lib/macroCalc";
import {
  detectProtocolChanges,
  summarizeProtocolChanges,
  type ProtocolChange,
} from "@/lib/protocolChangeDetector";
import { mergeProtocolChanges } from "@/lib/protocolChangeMerge";
import { validateProtocolForPublication } from "@/lib/protocolPublicationValidation";
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
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { triageClasses, triageLabel } from "@/lib/protocolRenewalTriage";
import { functionErrorMessage } from "@/lib/functionError";
import {
  deleteRemoteNewDraft, fetchRemoteNewDraft, pickNewestDraft, saveRemoteNewDraft, withTimeout,
  type NewProtocolDraft,
} from "@/lib/protocolNewDraft";

interface Props {
  studentId: string;
  studentName: string;
}

const CheckinFeedbackPanel = lazyWithRetry(() => import("./CheckinFeedbackPanel"));

interface ProtocolRow {
  id: string;
  student_id: string;
  coach_id: string | null;
  name: string;
  is_template: boolean;
  payload: ProtocolPayload;
  active: boolean | null;
  updated_at: string;
  revision: number;
  persisted_draft?: ProtocolPayload | null;
}

/**
 * [FIX crítico] Merge parcial de importação.
 * Antes, importar um arquivo que continha só treino (ou só suplementos)
 * substituía o payload inteiro e apagava o que o coach já tinha digitado nas
 * outras abas. Agora só as seções realmente presentes no arquivo importado
 * sobrescrevem o estado atual; o resto é preservado.
 */
function mergeImportedPayload(prev: ProtocolPayload | null, imported: ProtocolPayload): ProtocolPayload {
  if (!prev) return imported;
  const next: any = { ...prev };
  const inc: any = imported;
  const hasArr = (v: unknown) => Array.isArray(v) && v.length > 0;

  if (hasArr(inc.workouts)) {
    next.workouts = inc.workouts;
    if (inc.periodization !== undefined) next.periodization = inc.periodization;
  }
  if (hasArr(inc.meals)) next.meals = inc.meals;
  if (hasArr(inc.supplements)) next.supplements = inc.supplements;
  if (hasArr(inc.supplementCombos)) next.supplementCombos = inc.supplementCombos;
  if (hasArr(inc.cardio)) next.cardio = inc.cardio;
  if (inc.macros && (inc.macros.calories || inc.macros.protein)) next.macros = inc.macros;
  if (inc.guidelines && Object.values(inc.guidelines).some((v) => typeof v === "string" && v.trim())) {
    next.guidelines = { ...(prev as any).guidelines, ...inc.guidelines };
  }
  if (inc.setup) next.setup = { ...(prev as any).setup, ...inc.setup };
  if (inc.carbCycle && Object.keys(inc.carbCycle).length) next.carbCycle = inc.carbCycle;
  if (inc.carbCycleNotes && Object.keys(inc.carbCycleNotes).length) next.carbCycleNotes = inc.carbCycleNotes;

  // Importar troca `workouts` por inteiro: descarta dias da semana que apontam para treino que sumiu.
  return pruneOrphanWeekDays(next) as ProtocolPayload;
}

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
  // Aba Treinos: "Treino atual" (protocolo) ou "Semana corrida" (treino secundário).
  const [workoutsView, setWorkoutsView] = useState<"main" | "busy">("main");
  const [busyMounted, setBusyMounted] = useState(false);
  const [busyDirty, setBusyDirty] = useState(false);
  const busyRef = useRef<BusyWeekInlineHandle>(null);
  const { data: busyAssignments = [] } = useBusyWeekAssignments(coachId);
  const busyMine = busyAssignments.find((a) => a.student_id === studentId && a.enabled);
  const busyStatus = busyMine ? (busyMine.student_on ? "em uso" : "ativa") : "";
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
    setSaveStatus("dirty");
  };
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSplit, setSetupSplit] = useState<SplitValue>("ABC");
  const [setupMeals, setSetupMeals] = useState(5);
  const [setupCarbCycle, setSetupCarbCycle] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Ordem do trabalho: Treino → Macros → Dieta → Diretrizes (as diretrizes
  // explicam o que já foi montado). Abre no Treino.
  const [activeTab, setActiveTab] = useState<"macros" | "guidelines" | "workouts" | "diet">("workouts");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const confirm = useConfirm();
  const ENABLE_AI_INITIAL_DRAFT = true;
  const [aiSuggestion, setAiSuggestion] = useState<{
    calories: number; protein: number; carbs: number; fat: number; water: number; goal: string; rationale: string;
    treino?: string;
    meals?: Array<{ nome: string; kcal: number; protein: number; carbs: number; fat: number; sugestao: string }>;
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
  const [revision, setRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"published" | "dirty" | "saving" | "draft" | "conflict" | "error">("published");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const payloadRef = useRef<ProtocolPayload | null>(null);
  useEffect(() => { payloadRef.current = payload; }, [payload]);

  // ─── Rascunho local (localStorage) para PROTOCOLO NOVO ───────────────────
  // Protocolos já existentes têm autosave na área privada de rascunhos; a
  // criação não tem linha para salvar, então o rascunho vive no navegador.
  //
  // [FIX — persistência de rascunho para alunos novos] A chave é ancorada
  // exclusivamente no `student_id`, NUNCA no `protocol_id` — um aluno novo
  // ainda não tem protocolo salvo no banco (protocolId permanece `null` até
  // o primeiro save bem-sucedido), então qualquer chave derivada de
  // protocol_id ficaria indefinida/instável entre remounts e o rascunho se
  // perderia. `studentId` é estável desde o primeiro render do componente.
  const localDraftKey = `protocol_draft_student_${studentId}`;
  // Chave antiga (pré-fix), mantida só para migrar rascunhos já salvos por
  // versões anteriores do app — nunca escrevemos nela novamente.
  const legacyLocalDraftKey = `draft_protocol_${studentId}`;
  const [localDraft, setLocalDraft] = useState<{ name?: string; payload: unknown; savedAt?: number } | null>(null);
  const [localDraftOpen, setLocalDraftOpen] = useState(false);
  const localDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localDraftDecidedRef = useRef(false);
  // Rascunho do protocolo novo também no banco (protocol_new_drafts), para
  // continuar em outro aparelho. `remoteDraftClosedRef` fica true depois do
  // 1º salvar/descartar: impede que um autosave atrasado recrie o rascunho.
  const remoteDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteDraftClosedRef = useRef(false);

  // [FIX] Limpeza restrita: SÓ é chamada dentro do callback de sucesso da
  // mutação do Supabase (ver `save()`), nunca em cleanup de useEffect/unmount.
  // Limpar no unmount é o que causava a perda do rascunho de alunos novos —
  // trocar de aba/aluno e voltar desmontava e remontava o builder, e o
  // cleanup do efeito apagava o rascunho antes que qualquer save ocorresse.
  const clearLocalDraft = () => {
    try {
      localStorage.removeItem(localDraftKey);
      localStorage.removeItem(legacyLocalDraftKey);
    } catch { /* quota/privado */ }
    setLocalDraft(null);
    // Mesmo destino para a cópia no banco.
    remoteDraftClosedRef.current = true;
    if (remoteDraftTimerRef.current) { clearTimeout(remoteDraftTimerRef.current); remoteDraftTimerRef.current = null; }
    // Só existe rascunho remoto de protocolo NOVO; em edição não há o que apagar.
    if (!protocolId) {
      void supabase.auth.getSession().then(({ data }) => {
        const uid = data.session?.user?.id;
        if (uid && studentId) void deleteRemoteNewDraft(uid, studentId);
      });
    }
  };

  const tabLabel: Record<typeof activeTab, string> = {
    macros: "Macros",
    guidelines: "Diretrizes",
    workouts: "Treino",
    diet: "Dieta",
  } as const;

  useEffect(() => {
    if (!isDirty && !busyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, busyDirty]);

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
      if (!data) return null;
      const { data: draft, error: draftError } = await sb
        .from("protocol_drafts")
        .select("payload")
        .eq("protocol_id", data.id)
        .maybeSingle();
      if (draftError) throw draftError;
      return { ...(data as ProtocolRow), persisted_draft: (draft?.payload as ProtocolPayload | undefined) ?? null };
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
      setRevision(existing.revision ?? 0);
      // Se houver rascunho salvo, retomar dele; senão, usar o payload publicado.
      const draftParsed = existing.persisted_draft
        ? ProtocolPayloadSchema.safeParse(existing.persisted_draft)
        : null;
      const publishedParsed = ProtocolPayloadSchema.safeParse(existing.payload);
      if (draftParsed && draftParsed.success) {
        setPayload(draftParsed.data);
        setHasDraft(true);
        setSaveStatus("draft");
      } else {
        setPayload(publishedParsed.success
          ? publishedParsed.data
          : buildBasePayload({ split: "ABC", mealsCount: 5, carbCycle: false }));
        setHasDraft(false);
        setSaveStatus("published");
      }
      // Só grava o snapshot na primeira vez que carregamos este protocolo.
      // Ignora revalidações posteriores para não corromper a comparação.
      if (previousPayloadRef.current == null) {
        previousPayloadRef.current = existing.payload ?? null;
        previousActiveRef.current = existing.active ?? true;
      }
    } else if (!isLoading && existing === null) {
      // [FIX] Criação (aluno novo, sem protocolo no banco): decide UMA ÚNICA
      // vez por montagem se há rascunho local a recuperar. `localDraftDecidedRef`
      // é o guarda-chuva: sem ele, um refetch da query em background (foco na
      // aba, reconexão etc.) reexecuta este efeito com `existing` ainda `null`
      // e reabriria o modal de "Setup do Protocolo" por cima do formulário que
      // o coach já estava preenchendo, resetando visualmente o trabalho em
      // andamento. Com o guarda, a decisão (retomar rascunho / abrir setup
      // limpo) é tomada apenas uma vez; reruns seguintes do efeito são no-op.
      if (localDraftDecidedRef.current) return;
      localDraftDecidedRef.current = true;

      let localSaved: NewProtocolDraft | null = null;
      try {
        // Lê a chave estável atual; se não houver nada, tenta a chave legada
        // (versões anteriores do app) e migra para a chave nova.
        const raw = localStorage.getItem(localDraftKey) ?? localStorage.getItem(legacyLocalDraftKey);
        if (raw) {
          localSaved = JSON.parse(raw);
          localStorage.setItem(localDraftKey, raw);
          localStorage.removeItem(legacyLocalDraftKey);
        }
      } catch { localSaved = null; }

      // Também procura o rascunho salvo no banco (outro aparelho) e fica com o
      // mais recente. Espera no máximo 4s; sem resposta, segue só com o local.
      void (async () => {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id ?? null;
        const remote = uid && studentId
          ? await withTimeout(fetchRemoteNewDraft(uid, studentId), 4000, null)
          : null;
        const saved = pickNewestDraft(localSaved, remote);
        if (saved?.payload) {
          // Rascunho encontrado: bloqueia a renderização do formulário limpo
          // (payload continua `null`) e exibe o modal de recuperação.
          setLocalDraft(saved);
          setLocalDraftOpen(true);
          return;
        }
        // Sem rascunho: abre o setup do zero (só desta vez).
        setSetupOpen(true);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, isLoading, studentName]);

  const isEditMode = !!protocolId;

  // [FIX] Persistência contínua (debounce 1000ms) do rascunho local em modo
  // criação. Grava o payload COMPLETO do formulário (dieta + treinos +
  // macros + diretrizes) sob `localDraftKey` (estável por `student_id`).
  // Importante: o cleanup deste efeito só limpa o TIMER pendente — nunca
  // chama `clearLocalDraft()`/`removeItem`. Um cleanup que apagasse o
  // rascunho no unmount destruiria o rascunho do aluno novo sempre que o
  // componente desmontasse antes do save (troca de aba, navegação, etc.),
  // que era exatamente o bug relatado.
  useEffect(() => {
    if (isEditMode || !payload || !isDirty) return;
    if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
    localDraftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(localDraftKey, JSON.stringify({ name, payload, savedAt: Date.now() }));
      } catch { /* quota/privado */ }
    }, 1000);
    // Cópia no banco com intervalo maior (menos requisições enquanto digita).
    remoteDraftClosedRef.current = false;
    if (remoteDraftTimerRef.current) clearTimeout(remoteDraftTimerRef.current);
    remoteDraftTimerRef.current = setTimeout(() => {
      remoteDraftTimerRef.current = null;
      if (!coachId || !studentId || remoteDraftClosedRef.current) return;
      void saveRemoteNewDraft(coachId, studentId, { name, payload }).then(() => {
        // Salvou/descartou enquanto a gravação estava em voo → apaga de novo.
        if (remoteDraftClosedRef.current) void deleteRemoteNewDraft(coachId, studentId);
      });
    }, 2500);
    return () => {
      if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
      if (remoteDraftTimerRef.current) { clearTimeout(remoteDraftTimerRef.current); remoteDraftTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, name, isDirty, isEditMode]);

  function resumeLocalDraft() {
    const parsed = ProtocolPayloadSchema.safeParse(localDraft?.payload);
    if (!parsed.success) {
      toast.error("Rascunho corrompido — começando um protocolo novo");
      clearLocalDraft();
      setLocalDraftOpen(false);
      setSetupOpen(true);
      return;
    }
    setPayload(parsed.data);
    setName(localDraft?.name?.trim() || `Protocolo — ${studentName}`);
    setActive(true);
    setIsDirty(true);
    setLocalDraftOpen(false);
    setSetupOpen(false);
    toast.success("Rascunho restaurado");
  }

  function discardLocalDraft() {
    clearLocalDraft();
    setLocalDraftOpen(false);
    setSetupOpen(true);
  }

  // ─── Autosave na área privada de rascunhos ─────────────────────────────
  // Só roda em modo edição de um protocolo já existente. Nunca toca em `payload`.
  async function performAutosave() {
    if (!isEditMode || !protocolId) return;
    const current = payloadRef.current;
    if (!current) return;
    setIsAutosaving(true);
    setSaveStatus("saving");
    const task = async () => {
      try {
      const parsed = ProtocolPayloadSchema.parse(current);
      if (!coachId) throw new Error("Coach não identificado");
      const { data, error } = await sb.rpc("save_protocol_with_plan", buildSaveProtocolArgs({
        protocolId,
        studentId,
        coachId,
        name,
        payload: parsed,
        active,
        asDraft: true,
        expectedRevision: revision,
      }));
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result?.revision != null) setRevision(result.revision);
      setLastAutosavedAt(new Date());
      setHasDraft(true);
      setSaveStatus("draft");
    } catch (e) {
      console.error("[autosave] falhou", e);
      const message = e instanceof Error ? e.message : String(e);
      setSaveStatus(message.includes("revision conflict") ? "conflict" : "error");
    } finally {
      setIsAutosaving(false);
    }
    };
    saveChainRef.current = saveChainRef.current.then(task, task);
    await saveChainRef.current;
  }

  const flushAutosave = async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      await performAutosave();
    }
    await saveChainRef.current;
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
    void flushAutosave();
    setActiveTab(v as typeof activeTab);
  };

  // Macros → "Editar na semana": a faixa da semana do Treino é o único lugar
  // de editar treino e carbo por dia (Pacote B da auditoria).
  const goToWeekStrip = () => {
    handleTabChange("workouts");
    setWorkoutsView("main");
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="week-strip"]');
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1600);
    }, 80);
  };

  async function discardDraft() {
    if (!protocolId || !existing) return;
    const ok = await confirm({
      title: "Descartar rascunho",
      description: "As alterações ainda não publicadas serão perdidas. O aluno continua vendo a última versão publicada.",
      confirmLabel: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    try {
      const { error } = await sb.from("protocol_drafts").delete().eq("protocol_id", protocolId);
      if (error) throw error;
      const publishedParsed = ProtocolPayloadSchema.safeParse(existing.payload);
      if (publishedParsed.success) setPayload(publishedParsed.data);
      setHasDraft(false);
      setIsDirty(false);
      setLastAutosavedAt(null);
      setSaveStatus("published");
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
      const { data, error } = await sb.functions.invoke("protocol-initial-draft", {
        body: {
          studentId,
          mealsCount: setupMeals,
          split: SPLIT_OPTIONS.find((s) => s.value === setupSplit)?.label ?? setupSplit,
          carbCycle: setupCarbCycle,
        },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Não foi possível gerar sugestão agora"));
      if (!data?.ok) {
        toast.error(
          data?.reason === "sem_anamnese"
            ? "Sem dados do aluno ainda (anamnese, medidas ou check-in)"
            : "Não foi possível gerar sugestão agora",
        );
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
      if (error) throw new Error(await functionErrorMessage(error, "Não foi possível gerar sugestão agora"));
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
              const tacoRef = [...ENRICHED_FOODS, ...TACO_FOODS].find(
                (t) => t.name.toLowerCase() === String(item.baseName || item.name).toLowerCase()
              );
              const unitW = tacoRef && typeof (tacoRef as any).unitWeight === "number" ? (tacoRef as any).unitWeight : undefined;
              const { grams } = parseWeightString(valor, unitW, (tacoRef as any)?.portions);
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
    toast.success(`${count} alteração(ões) aplicada(s) — revise e clique em "Publicar para o aluno".`);
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
      // Aplica a distribuição por refeição sugerida (nomes, macros e dica de alimentos).
      const suggestedMeals = aiSuggestion.meals ?? [];
      if (suggestedMeals.length) {
        base.meals = base.meals.map((m, i) => {
          const s = suggestedMeals[i];
          if (!s) return m;
          return {
            ...m,
            name: s.nome || m.name,
            macros: { carbs: s.carbs, protein: s.protein, fat: s.fat },
            notes: s.sugestao ? `Sugestão IA: ${s.sugestao}` : m.notes,
          };
        });
      }
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
    // Semana Corrida com alterações: o Salvar/Publicar do protocolo salva junto
    // (antes eram dois botões e a edição podia se perder ao publicar).
    if (busyDirty && busyRef.current) {
      const ok = await busyRef.current.saveIfDirty();
      if (!ok) { setWorkoutsView("busy"); return; }
    }
    if (!name.trim()) { toast.error("Dê um nome ao protocolo"); return; }
    if (!opts.asDraft && !active) {
      toast.error("Protocolo inativo — clique em Ativar (na barra de baixo) antes de publicar.");
      return;
    }
    if (!opts.asDraft) {
      const validation = validateProtocolForPublication(payload);
      if (validation.errors.length > 0) {
        toast.error(validation.errors[0]);
        return;
      }
      if (validation.warnings.length > 0) toast.warning(validation.warnings.join(" "));
    }
    // Cancela qualquer autosave em voo/pendente para não colidir com o publish.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const publishActive = opts.asDraft ? false : active;
    setSaving(true);
    setSaveStatus("saving");
    try {
      await saveChainRef.current;
      const parsed = ProtocolPayloadSchema.parse(payload);
      if (!coachId) throw new Error("Coach não identificado");
      // O snapshot em `protocol_versions` (payload anterior + próxima versão) agora
      // é feito DENTRO da RPC `save_protocol_with_plan`, na mesma transação do
      // UPDATE em `protocols`. Antes era um insert separado no client, que podia
      // gravar histórico sem o protocolo correspondente ter sido atualizado.
      // ─── Gravação atômica: protocols + coach_plans numa única transação ───
      // Antes eram dois writes independentes no client; quando o segundo
      // falhava, o protocolo ficava salvo e o plano lido pelas telas do aluno
      // (WorkoutPlan, DynamicRoutine, Supplements, useStudentData) ficava
      // desatualizado, sem nenhuma forma de reprocessar. O RPC garante que ou
      // as duas tabelas gravam, ou nenhuma grava.
      const { data: savedId, error: rpcError } = await sb.rpc("save_protocol_with_plan", buildSaveProtocolArgs({
        protocolId: isEditMode && protocolId ? protocolId : null,
        studentId,
        coachId,
        name,
        payload: parsed,
        active: publishActive,
        asDraft: !!opts.asDraft,
        expectedRevision: revision,
      }));
      if (rpcError) throw rpcError;
      const savedResult = Array.isArray(savedId) ? savedId[0] : savedId;
      if (savedResult?.revision != null) setRevision(savedResult.revision);
      // Salvou no banco com sucesso → o rascunho local não é mais necessário.
      if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
      clearLocalDraft();

      if (isEditMode && protocolId) {
        if (!opts.asDraft) setHasDraft(false);
        toast.success(opts.asDraft ? "Rascunho salvo — aluno ainda não vê esta versão" : "Protocolo atualizado");
      } else {
        if (savedResult?.protocol_id) setProtocolId(savedResult.protocol_id);
        toast.success(opts.asDraft ? "Rascunho criado — aluno ainda não vê esta versão" : "Protocolo criado");
      }
      if (!opts.asDraft) {
        setActive(publishActive);
        setSaveStatus("published");
        toast.success("Dieta e Treino sincronizados com o aluno");
      }
      // ─── Geração best-effort de eventos de mudança do protocolo ───
      // Só roda em UPDATE (protocolo já existia), publicação real (não rascunho),
      // e com o protocolo efetivamente ativo depois do save. Falhas aqui não
      // desfazem o UPDATE em `protocols` e não bloqueiam o fluxo.
      // Resumo das mudanças para o e-mail ao aluno (preenchido abaixo).
      let changeLabelsForEmail: string[] = [];
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
          changeLabelsForEmail = changes.map((c) => c.label);
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
      // Aviso ao aluno pelo e-mail cadastrado (além do card no app). O servidor
      // limita a 1 e-mail a cada 6 h por aluno; falha nunca bloqueia o coach.
      if (!opts.asDraft && publishActive && studentId) {
        void supabase.functions
          .invoke("notify-protocol-published", {
            body: { studentId, isFirst: !isEditMode, changes: changeLabelsForEmail },
          })
          .then(({ error }) => { if (error) console.warn("notify-protocol-published falhou (não bloqueia)", error); });
      }
      if (coachId) {
        // Atualiza o DNA do coach no banco e, quando termina, recarrega o cache do
        // autocompletar — sem isso o que acabou de ser prescrito só apareceria
        // como sugestão depois de recarregar a página.
        void sb.rpc("refresh_coach_ai_profile", { p_coach_id: coachId }).then(({ error }) => {
          if (error) {
            console.warn("refresh_coach_ai_profile falhou (não bloqueia o save)", error);
            return;
          }
          void reloadCoachProfile(coachId);
        });
      }
      qc.invalidateQueries({ queryKey: ["protocol-builder", studentId] });
      qc.invalidateQueries({ queryKey: queryKeys.studentProtocol(studentId) });
      setIsDirty(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro ao salvar";
      if (message.includes("revision conflict")) {
        setSaveStatus("conflict");
        toast.error("Conflito de edição: recarregue a versão mais recente antes de publicar.");
      } else {
        setSaveStatus("error");
        toast.error(message);
      }
    } finally { setSaving(false); }
  }

  // [Consolidação de templates] O antigo saveAsTemplate() daqui sempre fazia
  // INSERT (mesmo quando o protocolo tinha se originado de um template),
  // divergindo do fluxo de TemplateLibraryDialog (que já sabia fazer
  // UPDATE via `editingTemplate`). Nenhum botão desta tela chamava essa
  // função — removida para eliminar o mecanismo de salvar duplicado e
  // deixar TemplateLibraryDialog como o único ponto de salvar/atualizar
  // template, evitando duplicatas.

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Topo enxuto (auditoria 21/11/2026): nome + 3 ações diretas + Mais.
          Ativo e Importar/Exportar (raros) foram para o menu Mais; o nome do
          aluno já está no cabeçalho da página. */}
      {payload && (
        <Card className="bg-card/60 border-border p-3 sm:p-4" data-testid="protocol-top">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1 min-w-0">
              <Label htmlFor="protocol-name" className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome do protocolo</Label>
              <Input id="protocol-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 text-sm w-full" />
            </div>
            <div className="grid grid-cols-4 sm:flex sm:items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-9 flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-3"
                onClick={() => window.open(`/student-area?previewAs=${studentId}&draftPreview=1`, "_blank")}
                title="Ver como aluno"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="sm:hidden">Prévia</span>
                <span className="hidden sm:inline">Ver como aluno</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-9 flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-3"
                onClick={() => setHistoryOpen(true)}
                title="Histórico: alterações enviadas ao aluno e versões publicadas"
                data-testid="protocol-history"
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-9 flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-3"
                onClick={() => setConsultOpen(true)}
                title="Abrir anamnese do aluno"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Anamnese</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-11 sm:h-9 flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-3"
                    title="Mais ações"
                    data-testid="protocol-more-menu"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    <span>Mais</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onSelect={() => setSetupOpen(true)} className="text-xs">
                    <Sparkles className="w-3.5 h-3.5 mr-2" /> Recriar base
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setLibraryOpen(true)} className="text-xs">
                    <Library className="w-3.5 h-3.5 mr-2" /> Biblioteca de modelos
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCopyOpen(true)} className="text-xs">
                    <Copy className="w-3.5 h-3.5 mr-2" /> Copiar para outro aluno
                  </DropdownMenuItem>
                  {isEditMode && (
                    <DropdownMenuItem onSelect={openRenewalSuggestion} className="text-xs">
                      <RefreshCw className="w-3.5 h-3.5 mr-2" /> Renovar ciclo (IA)
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setImportExportOpen(true)} className="text-xs" data-testid="menu-import-export">
                    <Settings2 className="w-3.5 h-3.5 mr-2" /> Importar / Exportar
                  </DropdownMenuItem>
                  {/* Só "Ativar": desligar por aqui nunca chegava ao aluno (o rascunho não
                      grava "ativo" e publicar exige ativo) — o protocolo seguia visível. */}
                  {!active && (
                    <DropdownMenuItem onSelect={() => setActive(true)} className="text-xs" data-testid="menu-activate">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Ativar protocolo
                    </DropdownMenuItem>
                  )}
                  {isEditMode && hasDraft && (
                    <DropdownMenuItem onSelect={() => void discardDraft()} className="text-xs text-destructive focus:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Descartar rascunho
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
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
            {/* Celular: 4 colunas sem rolagem (antes a 1ª aba aparecia cortada). */}
            <TabsList className="grid grid-cols-4 w-full h-auto p-1 gap-0.5 sm:flex sm:justify-center">
              {(() => {
                const c = computeCompletion(payload);
                const tabs: Array<{ v: "macros"|"guidelines"|"workouts"|"diet"; n: number; label: string; icon: JSX.Element; done: boolean }> = [
                  { v: "workouts",   n: 1, label: "Treino",     icon: <Dumbbell className="w-3.5 h-3.5 mr-1" />,         done: c.workouts },
                  { v: "macros",     n: 2, label: "Macros",     icon: <BarChart3 className="w-3.5 h-3.5 mr-1" />,        done: c.macros },
                  { v: "diet",       n: 3, label: "Dieta",      icon: <UtensilsCrossed className="w-3.5 h-3.5 mr-1" />,  done: c.diet },
                  { v: "guidelines", n: 4, label: "Diretrizes", icon: <FileText className="w-3.5 h-3.5 mr-1" />,         done: c.guidelines },
                ];
                return tabs.map((t) => (
                  <TabsTrigger key={t.v} value={t.v} className="min-w-0 px-1 sm:px-3 text-xs sm:text-sm">
                    <span className="hidden sm:inline-flex">{t.icon}</span>
                    <span className="hidden sm:inline">{t.n} ·&nbsp;</span>
                    <span className="truncate">{t.label}</span>
                    {t.done && <CheckCircle2 className="w-3 h-3 ml-1 shrink-0 text-emerald-500" aria-label="preenchido" />}
                  </TabsTrigger>
                ));
              })()}
            </TabsList>
            <TabsContent value="macros" className="mt-4"><MacrosTab payload={payload} setPayload={updatePayload} onEditWeek={goToWeekStrip} /></TabsContent>
            <TabsContent value="guidelines" className="mt-4"><GuidelinesTab payload={payload} setPayload={updatePayload} coachId={coachId} onOpenTemplateLibrary={() => setLibraryOpen(true)} /></TabsContent>
            <TabsContent value="workouts" className="mt-4">
              {/* Treino atual ↔ Semana Corrida: o mesmo editor, um de cada vez. */}
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1 w-full sm:w-auto" role="radiogroup" aria-label="Qual treino editar">
                  {([
                    { v: "main", label: "Treino atual" },
                    { v: "busy", label: "Semana corrida" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={workoutsView === o.v}
                      onClick={() => { setWorkoutsView(o.v); if (o.v === "busy") setBusyMounted(true); }}
                      className={cn(
                        "h-8 px-4 rounded-md text-sm font-semibold transition inline-flex items-center justify-center gap-1.5",
                        workoutsView === o.v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                      data-testid={`workouts-view-${o.v}`}
                    >
                      {o.label}
                      {o.v === "busy" && busyDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-label="alterações não salvas" />}
                      {o.v === "busy" && !busyDirty && busyStatus && (
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{busyStatus}</span>
                      )}
                    </button>
                  ))}
                </div>
                {workoutsView === "busy" && (
                  <p className="text-[11px] text-muted-foreground">Treino secundário para semanas apertadas — salva separado do protocolo.</p>
                )}
                {workoutsView === "main" && (
                  <div className="ml-auto">
                    <WorkoutModelsMenu payload={payload} setPayload={updatePayload} coachId={coachId} onOpenLibrary={() => setLibraryOpen(true)} />
                  </div>
                )}
              </div>
              <div className={workoutsView === "main" ? undefined : "hidden"}>
                <WorkoutsTab
                  payload={payload}
                  setPayload={updatePayload}
                  coachId={coachId}
                  onOpenTemplateLibrary={() => setLibraryOpen(true)}
                  hideModelsMenu
                  onOpenMacros={() => handleTabChange("macros")}
                />
              </div>
              {busyMounted && (
                <div className={workoutsView === "busy" ? undefined : "hidden"}>
                  <BusyWeekInlineEditor
                    ref={busyRef}
                    coachId={coachId}
                    studentId={studentId}
                    studentName={studentName}
                    protocolWorkouts={payload.workouts}
                    onDirtyChange={setBusyDirty}
                  />
                </div>
              )}
            </TabsContent>
            <TabsContent value="diet" className="mt-4"><DietTab payload={payload} setPayload={updatePayload} onOpenTemplateLibrary={() => setLibraryOpen(true)} /></TabsContent>
          </Tabs>

            </div>
          </div>

          <PublishBar
            status={{
              isEditMode,
              active,
              publishing: saving,
              autosaving: isAutosaving,
              saveStatus,
              isDirty,
              hasDraft,
              lastAutosavedAt,
            }}
            pendingChanges={pendingChanges}
            publishLabel={isEditMode ? { full: "Publicar para o aluno", short: "Publicar" } : { full: "Criar e publicar", short: "Criar e publicar" }}
            publishing={saving}
            onPublish={() => save()}
            onActivate={() => setActive(true)}
            onDiscardDraft={isEditMode && hasDraft ? () => void discardDraft() : undefined}
          />
        </>
      )}

      <Dialog open={importExportOpen} onOpenChange={setImportExportOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Importar / Exportar</DialogTitle>
            <DialogDescription className="text-xs">
              Baixe o protocolo em Excel ou JSON, ou importe um JSON — a importação só troca as seções que vierem no arquivo.
            </DialogDescription>
          </DialogHeader>
          {payload && (
            <ProtocolImportExport
              hideHeading
              payload={payload}
              studentName={studentName}
              onImport={(p) => { updatePayload(mergeImportedPayload(payload, p)); setProtocolId(protocolId); setImportExportOpen(false); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Recuperação de rascunho local (protocolo novo, não salvo no banco) */}
      <Dialog open={localDraftOpen} onOpenChange={() => { /* bloqueante: exige escolha */ }}>
        <DialogContent className="sm:max-w-[420px]" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Rascunho não salvo</DialogTitle>
            <DialogDescription className="text-xs">
              Foi encontrado um rascunho não salvo para este aluno
              {localDraft?.savedAt
                ? ` (${new Date(localDraft.savedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`
                : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={resumeLocalDraft} className="w-full">Continuar de onde parei</Button>
            <Button variant="outline" onClick={discardLocalDraft} className="w-full">Descartar alterações</Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  {aiSuggestion.treino && (
                    <p className="text-[11px] text-muted-foreground">Treino: {aiSuggestion.treino}</p>
                  )}
                  {!!aiSuggestion.meals?.length && (
                    <div className="pt-1 space-y-1">
                      <p className="text-[11px] font-semibold text-foreground/80">
                        Distribuição em {aiSuggestion.meals.length} refeições:
                      </p>
                      {aiSuggestion.meals.map((m, i) => (
                        <div key={i} className="text-[11px] text-muted-foreground leading-snug">
                          <span className="text-foreground/80">{m.nome}</span> — {m.kcal} kcal · P {m.protein}g · C {m.carbs}g · G {m.fat}g
                          {m.sugestao && <span className="block opacity-80">{m.sugestao}</span>}
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground/80">Aplicado ao clicar em “Gerar Base” — você pode editar tudo depois.</p>
                    </div>
                  )}
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
                  <div className={`rounded-md border p-2 space-y-1 ${triageClasses(renewalAction.acao).box}`}>
                    <p className={`text-xs font-semibold ${triageClasses(renewalAction.acao).text}`}>
                      Triagem: {triageLabel(renewalAction.acao)}
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

      {historyOpen && (
        <Suspense fallback={null}>
          <ProtocolHistoryDialog
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            studentId={studentId}
            studentName={studentName}
            protocolId={protocolId}
            onRestore={(p) => { updatePayload(p); }}
          />
        </Suspense>
      )}
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
