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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { lazy, Suspense } from "react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Loader2, Save, Plus, Trash2, FileText, Dumbbell, UtensilsCrossed,
  Calendar, Sparkles, BarChart3, Activity, Pill, TrendingUp, TrendingDown, Minus,
  CheckCircle2, ChevronDown, Copy, BookmarkPlus, Library, ClipboardList,
  ArrowUp, ArrowDown, Eye, Settings2, History, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { ExercisePickerInput } from "@/components/coach/ExercisePickerInput";
import {
  ProtocolPayloadSchema, ProtocolPayload, SPLIT_OPTIONS, WEEKDAYS,
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
import { calcMealMacros, calcDayMacros, tacoGroupToKind, parseWeightString, optionMacros, compareOptions, type SubstitutionSeverity } from "@/lib/macroCalc";
import {
  detectProtocolChanges,
  summarizeProtocolChanges,
  type ProtocolChange,
} from "@/lib/protocolChangeDetector";
import { mergeProtocolChanges } from "@/lib/protocolChangeMerge";

import { TACO_FOODS } from "@/data/tacoFoods";
const TACO_DATA = TACO_FOODS.map((t, i) => ({ ...t, id: String(i), cookFactor: t.cookFactor ?? 1 }));
import { searchFoods, type FoodHit } from "@/lib/foodSearch";

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

  function generateBase() {
    const base = buildBasePayload({ split: setupSplit, mealsCount: setupMeals, carbCycle: setupCarbCycle });
    updatePayload(base);
    setName(`Protocolo — ${studentName}`);
    setActive(true);
    setProtocolId(null);
    setSetupOpen(false);
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
      qc.invalidateQueries({ queryKey: ["protocol-builder", studentId] });
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
                <p className="text-sm font-semibold text-foreground truncate">{studentName}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold uppercase text-xs shrink-0">
                {studentName.slice(0, 2)}
              </div>
            </div>
          </div>

          {/* Second row: action buttons */}
          {payload && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Ver como aluno</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setConsultOpen(true)}
              >
                <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Anamnese</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setSetupOpen(true)}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Recriar base</span>
              </Button>
            </div>
          )}

          {/* Name input inline (only when there is a payload) */}
          {payload && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome do protocolo</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm flex-1" />
                {isEditMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs"
                    onClick={() => setHistoryOpen(true)}
                    title="Ver histórico de versões"
                  >
                    <History className="w-3.5 h-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Histórico</span>
                  </Button>
                )}
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
            <TabsContent value="workouts" className="mt-4"><WorkoutsTab payload={payload} setPayload={updatePayload} coachId={coachId} /></TabsContent>
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
              <Button onClick={saveAsTemplate} disabled={saving} size="lg" variant="ghost" className="shadow-lg mr-auto">
                <BookmarkPlus className="w-4 h-4 mr-2" />
                Salvar template
              </Button>
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
            <Button onClick={generateBase} className="w-full"><Sparkles className="w-4 h-4 mr-2" /> Gerar Base</Button>
          </div>
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
    </div>
  );
}

// ─── MacrosTab ───────────────────────────────────────────────────────────────

function MacrosTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const m = payload.macros;
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
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── GuidelinesTab ────────────────────────────────────────────────────────────

function GuidelinesTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const upd = (k: keyof ProtocolPayload["guidelines"], v: string) => setPayload({ ...payload, guidelines: { ...payload.guidelines, [k]: v } });
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    training: false, diet: false, weekOrganization: false, supplementation: false,
  });
  const toggle = (k: string) => setOpenMap((m) => ({ ...m, [k]: !m[k] }));
  const blocks: Array<{ k: keyof ProtocolPayload["guidelines"]; label: string; hint?: string; minH: string }> = [
    { k: "training",         label: "Diretrizes de treino", hint: "Regras gerais (foco, intensidade, falha, descanso)", minH: "min-h-[100px]" },
    { k: "diet",             label: "Diretrizes da dieta",  hint: "Hidratação, sal, fibras, suplementos com refeições",  minH: "min-h-[100px]" },
    { k: "weekOrganization", label: "Organização da semana", hint: "Ex.: Seg/Qua/Sex carbo alto · Ter/Qui/Sab/Dom carbo baixo", minH: "min-h-[80px]" },
    { k: "supplementation",  label: "Suplementação — obs. gerais", minH: "min-h-[100px]" },
  ];
  const showToStudent: boolean = (payload as any).showGuidelines ?? false;
  const setShowToStudent = (v: boolean) => setPayload({ ...payload, showGuidelines: v } as any);
  return (
    <Card className="bg-card/60 border-border p-4 space-y-4">
      {/* Controle de visibilidade para o aluno */}
      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold">Exibir Diretrizes para o aluno</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Quando ativo, o aluno verá as diretrizes e a Regra de Ouro no Plano de Treino.</p>
        </div>
        <Switch checked={showToStudent} onCheckedChange={setShowToStudent} />
      </div>
      {blocks.map((b) => {
        const isOpen = openMap[b.k as string] ?? true;
        const val = (payload.guidelines[b.k] ?? "") as string;
        const preview = val.trim().slice(0, 80);
        return (
          <div key={b.k as string} className="border border-border/40 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(b.k as string)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold">{b.label}</p>
                {!isOpen && preview && (
                  <p className="text-[10px] text-muted-foreground truncate">{preview}{val.length > 80 ? "…" : ""}</p>
                )}
                {!isOpen && !preview && (
                  <p className="text-[10px] text-muted-foreground italic">vazio</p>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="p-3 space-y-1">
                {b.hint && <p className="text-[10px] text-muted-foreground">{b.hint}</p>}
                <Textarea
                  value={val}
                  onChange={(e) => upd(b.k, e.target.value)}
                  className={cn(b.minH, "text-sm")}
                />
              </div>
            )}
          </div>
        );
      })}
      <SupplementsSection payload={payload} setPayload={setPayload} />
    </Card>
  );
}

// ─── SupplementsSection ──────────────────────────────────────────────────────

function SupplementsSection({
  payload,
  setPayload,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
}) {
  const supplements = payload.supplements ?? [];
  const combos = payload.supplementCombos ?? [];

  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [comboName, setComboName] = useState("");
  const [comboTiming, setComboTiming] = useState("Outro");
  const [comboPicks, setComboPicks] = useState<Set<number>>(new Set());

  // Índices já usados em algum combo (para exibir separado)
  const boundSet = new Set<number>();
  combos.forEach((c) => (c.supplementIndexes || []).forEach((i) => boundSet.add(i)));
  const unboundIndexes = supplements
    .map((_, i) => i)
    .filter((i) => !boundSet.has(i));

  const setSupplements = (next: typeof supplements) =>
    setPayload({ ...payload, supplements: next });

  const setCombos = (next: typeof combos) =>
    setPayload({ ...payload, supplementCombos: next });

  const updSupp = (si: number, patch: Partial<(typeof supplements)[number]>) => {
    const n = [...supplements];
    n[si] = { ...n[si], ...patch };
    setSupplements(n);
  };

  const addSupplement = () =>
    setSupplements([
      ...supplements,
      { name: "", dose: "", timing: "", notes: "", mealRef: "", objective: "outro" },
    ]);

  const removeSupplement = (si: number) => {
    const nextSupps = supplements.filter((_, j) => j !== si);
    // Remapear índices dos combos: remove o que sumiu; decrementa os maiores.
    const nextCombos = combos
      .map((c) => ({
        ...c,
        supplementIndexes: (c.supplementIndexes || [])
          .filter((i) => i !== si)
          .map((i) => (i > si ? i - 1 : i)),
      }))
      .filter((c) => (c.supplementIndexes || []).length > 0);
    setPayload({
      ...payload,
      supplements: nextSupps,
      supplementCombos: nextCombos,
    });
  };

  const openComboDialog = () => {
    setComboName("");
    setComboTiming("Outro");
    setComboPicks(new Set());
    setComboDialogOpen(true);
  };

  const togglePick = (i: number) => {
    setComboPicks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const confirmCombo = () => {
    if (comboPicks.size < 2) {
      toast.error("Selecione ao menos 2 suplementos para formar um combo.");
      return;
    }
    if (!comboName.trim()) {
      toast.error("Dê um nome ao combo.");
      return;
    }
    setCombos([
      ...combos,
      {
        name: comboName.trim(),
        timing: comboTiming,
        supplementIndexes: Array.from(comboPicks).sort((a, b) => a - b),
      },
    ]);
    setComboDialogOpen(false);
  };

  const removeCombo = (ci: number) => {
    // Desfaz o combo — os suplementos voltam a aparecer soltos.
    setCombos(combos.filter((_, j) => j !== ci));
  };

  const updCombo = (ci: number, patch: Partial<(typeof combos)[number]>) => {
    const n = [...combos];
    n[ci] = { ...n[ci], ...patch };
    setCombos(n);
  };

  const TIMING_OPTIONS = [
    "Ao acordar (jejum)", "Pré-treino", "Intra-treino", "Pós-treino",
    "Com refeição", "Antes de dormir", "Outro",
  ];

  const renderSupplementCard = (si: number) => {
    const s = supplements[si];
    if (!s) return null;
    return (
      <Card key={si} className="bg-card/60 border-border p-3">
        <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
          <Input
            value={s.name}
            onChange={(e) => updSupp(si, { name: e.target.value })}
            placeholder="Nome"
            className="h-8 text-xs"
          />
          <button
            onClick={() => removeSupplement(si)}
            className="text-muted-foreground hover:text-destructive p-1.5"
            title="Remover suplemento"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={s.dose}
            onChange={(e) => updSupp(si, { dose: e.target.value })}
            placeholder="Dose"
            className="h-8 text-xs"
          />
          <Select value={s.timing || "Outro"} onValueChange={(v) => updSupp(si, { timing: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMING_OPTIONS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-2 mt-2">
          <Select
            value={(s as any).mealRef || "__none__"}
            onValueChange={(v) => updSupp(si, { mealRef: v === "__none__" ? "" : v } as any)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Vincular à refeição (opcional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">— sem refeição —</SelectItem>
              {(payload.meals ?? []).map((mm, mi) => (
                <SelectItem key={mi} value={mm.name || `Refeição ${mi + 1}`} className="text-xs">
                  {mm.name || `Refeição ${mi + 1}`}{mm.time ? ` (${mm.time})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={s.notes}
            onChange={(e) => updSupp(si, { notes: e.target.value })}
            placeholder="Ex.: 30 min após a refeição"
            className="h-8 text-xs"
          />
        </div>
        <div className="mt-2">
          <Label className="text-[10px] text-muted-foreground">Objetivo</Label>
          <Select
            value={(s as any).objective || "outro"}
            onValueChange={(v) => updSupp(si, { objective: v as any } as any)}
          >
            <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPLEMENT_OBJECTIVES.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
    );
  };

  return (
    <div className="border-t border-border/40 pt-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Pill className="w-4 h-4 text-primary" /> Suplementos
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={openComboDialog}
            disabled={unboundIndexes.length < 2}
            title={unboundIndexes.length < 2 ? "Cadastre ao menos 2 suplementos livres" : "Agrupar suplementos em um combo"}
          >
            <Sparkles className="w-3 h-3 mr-1" /> Criar combo
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addSupplement}>
            <Plus className="w-3 h-3 mr-1" /> Suplemento
          </Button>
        </div>
      </div>

      {supplements.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border/40 rounded-lg">
          Nenhum suplemento cadastrado.
        </p>
      )}

      {/* Combos */}
      {combos.map((c, ci) => (
        <Card key={`combo-${ci}`} className="bg-primary/5 border-primary/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={c.name}
              onChange={(e) => updCombo(ci, { name: e.target.value })}
              placeholder="Nome do combo (ex.: Combo Manhã)"
              className="h-8 text-xs font-semibold"
            />
            <Select value={c.timing || "Outro"} onValueChange={(v) => updCombo(ci, { timing: v })}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMING_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => removeCombo(ci)}
              className="text-muted-foreground hover:text-destructive p-1.5"
              title="Desfazer combo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-primary/30">
            {(c.supplementIndexes || []).map((si) => renderSupplementCard(si))}
          </div>
        </Card>
      ))}

      {/* Suplementos soltos */}
      {unboundIndexes.map((si) => renderSupplementCard(si))}

      {/* Dialog: criar combo */}
      <Dialog open={comboDialogOpen} onOpenChange={setComboDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Criar combo de suplementos</DialogTitle>
            <DialogDescription className="text-xs">
              Agrupe 2 ou mais suplementos com um horário/momento único.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do combo</Label>
              <Input
                value={comboName}
                onChange={(e) => setComboName(e.target.value)}
                placeholder="Ex.: Combo Manhã"
                className="h-9 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Horário/momento</Label>
              <Select value={comboTiming} onValueChange={setComboTiming}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMING_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Suplementos ({comboPicks.size} selecionado{comboPicks.size === 1 ? "" : "s"})</Label>
              <div className="mt-1 max-h-56 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                {unboundIndexes.length === 0 && (
                  <p className="text-xs italic text-muted-foreground py-2 text-center">
                    Nenhum suplemento livre disponível.
                  </p>
                )}
                {unboundIndexes.map((i) => {
                  const s = supplements[i];
                  return (
                    <label
                      key={i}
                      className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={comboPicks.has(i)}
                        onChange={() => togglePick(i)}
                        className="accent-primary"
                      />
                      <span className="flex-1 truncate">
                        {s.name || <span className="italic text-muted-foreground">(sem nome)</span>}
                        {s.dose ? <span className="text-muted-foreground"> — {s.dose}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setComboDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmCombo}>
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Criar combo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── WorkoutsTab ─────────────────────────────────────────────────────────────

function WorkoutsTab({ payload, setPayload, coachId }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void; coachId: string | null }) {
  const updDay = (idx: number, patch: Partial<ProtocolPayload["workouts"][number]>) => { const n = [...payload.workouts]; n[idx] = { ...n[idx], ...patch }; setPayload({ ...payload, workouts: n }); };
  const updEx = (di: number, ei: number, patch: any) => { const n = [...payload.workouts]; const exs = [...n[di].exercises]; exs[ei] = { ...exs[ei], ...patch }; n[di] = { ...n[di], exercises: exs }; setPayload({ ...payload, workouts: n }); };
  const moveExercise = (di: number, ei: number, direction: "up" | "down") => {
    const n = [...payload.workouts];
    const exs = [...n[di].exercises];
    const targetIdx = direction === "up" ? ei - 1 : ei + 1;
    if (targetIdx < 0 || targetIdx >= exs.length) return;
    [exs[ei], exs[targetIdx]] = [exs[targetIdx], exs[ei]];
    n[di] = { ...n[di], exercises: exs };
    setPayload({ ...payload, workouts: n });
  };
  // Reordena o CARD do dia inteiro (ex: mover "Perna" para cima de "Peito")
  const moveDay = (di: number, direction: "up" | "down") => {
    const n = [...payload.workouts];
    const targetIdx = direction === "up" ? di - 1 : di + 1;
    if (targetIdx < 0 || targetIdx >= n.length) return;
    [n[di], n[targetIdx]] = [n[targetIdx], n[di]];
    setPayload({ ...payload, workouts: n });
  };
  const periodOn = !!payload.periodization?.enabled;
  const [overrideOpen, setOverrideOpen] = useState<Record<number, boolean>>({});

  // ── Map auxiliar e helpers de week strip ───────────────────────────────────
  const weekDays: Record<string, string> = (payload as any).weekDays ?? {};
  const ABBR: Record<string, string> = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };
  const today = (["dom","seg","ter","qua","qui","sex","sab"] as const)[new Date().getDay()];

  const setWeekday = (weekdayKey: string, workoutKey: string) => {
    const next: Record<string, string> = { ...weekDays };
    if (workoutKey === "" || next[weekdayKey] === workoutKey) delete next[weekdayKey];
    else next[weekdayKey] = workoutKey;
    setPayload({ ...payload, weekDays: next } as any);
  };

  const cyclePillCarb = (k: string) => {
    const cur = normalizeCarb((payload.carbCycle as any)?.[k]);
    setPayload({
      ...payload,
      carbCycle: { ...(payload.carbCycle ?? {}), [k]: cycleCarb(cur) } as any,
    });
  };

  const dayChipText = (workoutKey: string) => {
    const linked = DAY_KEYS.filter((k) => weekDays[k] === workoutKey);
    return linked.length === 0 ? "Sem dia" : linked.map((k) => ABBR[k]).join(", ");
  };

  return (
    <div className="space-y-3">
      <WorkoutPeriodizationEditor payload={payload} setPayload={setPayload} coachId={coachId} />

      {/* ── Week strip: pílulas Seg→Dom ── */}
      <Card className="bg-card/40 border-border p-2.5">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Semana</p>
          <p className="text-[9px] text-muted-foreground">Clique no carbo p/ alternar Alto · Base · Off</p>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAY_KEYS.map((k) => {
            const carb = normalizeCarb((payload.carbCycle as any)?.[k]);
            const wk = weekDays[k] ?? "";
            const isToday = k === today;
            return (
              <div
                key={k}
                className={cn(
                  "rounded-lg border bg-background/60 px-1 py-1 flex flex-col items-center gap-0.5",
                  isToday ? "border-[#CC0000]" : "border-border/40"
                )}
              >
                <span className="text-[9px] uppercase text-muted-foreground tracking-wider">{ABBR[k]}</span>
                <span className="text-[12px] font-bold text-foreground leading-none">{wk || "—"}</span>
                <button
                  type="button"
                  onClick={() => cyclePillCarb(k)}
                  title={`Carbo ${CARB_LABEL[carb]} — clique para alternar`}
                  className={cn(
                    "text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded border leading-none mt-0.5",
                    CARB_COLOR[carb].pill
                  )}
                >
                  {CARB_LABEL[carb]}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {payload.workouts.map((day, di) => (
        <Card key={day.key} className="bg-card/60 border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex flex-col -my-1">
              <button
                type="button"
                onClick={() => moveDay(di, "up")}
                disabled={di === 0}
                className="text-muted-foreground hover:text-primary p-0.5 disabled:opacity-20"
                title="Mover treino para cima"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveDay(di, "down")}
                disabled={di === payload.workouts.length - 1}
                className="text-muted-foreground hover:text-primary p-0.5 disabled:opacity-20"
                title="Mover treino para baixo"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-base shrink-0">{day.key}</div>
            <Input
              value={day.focus}
              onChange={(e) => updDay(di, { focus: e.target.value })}
              placeholder="Nome do treino (ex: Dorsal · Peito · Inferiores)"
              className="h-10 text-base font-bold flex-1 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/40 px-2"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/40 hover:bg-muted/60 border border-border/40 rounded-full px-2.5 py-1"
                  title="Dias da semana deste treino"
                >
                  {dayChipText(day.key)} <ChevronDown className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">Aparece em</p>
                <div className="space-y-0.5">
                  {DAY_KEYS.map((k) => {
                    const checked = weekDays[k] === day.key;
                    const takenBy = weekDays[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setWeekday(k, day.key)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-muted/60",
                          checked && "bg-primary/10 text-primary font-semibold"
                        )}
                      >
                        <span>{ABBR[k]}</span>
                        {checked ? <CheckCircle2 className="w-3.5 h-3.5" /> : takenBy ? <span className="text-[9px] text-muted-foreground">→ {takenBy}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {periodOn && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="text-[11px] text-foreground/80">
                Periodização ativa: séries, reps, cadência e descanso são geridos por semana.
              </p>
              <Button
                size="sm"
                variant={overrideOpen[di] ? "default" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => setOverrideOpen((s) => ({ ...s, [di]: !s[di] }))}
              >
                {overrideOpen[di] ? "Ocultar campos base" : "Editar valores base"}
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {day.exercises.length > 0 && (
              <div className={cn(
                "hidden md:grid gap-2 px-1 pb-1",
                periodOn && !overrideOpen[di]
                  ? "grid-cols-[1.8fr_1fr_auto]"
                  : "grid-cols-[1.8fr_0.6fr_0.6fr_0.6fr_0.6fr_1fr_auto]"
              )}>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Exercício</span>
                {(!periodOn || overrideOpen[di]) && (
                  <>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Séries</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Reps</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground cursor-help flex items-center gap-1" title="3010 = Excêntrico / Pausa / Concêntrico / Pausa">
                      Cadência ⓘ
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Descanso</span>
                  </>
                )}
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Obs</span>
                <span className="w-6"></span>
              </div>
            )}
            
            {day.exercises.map((ex, ei) => {
              const w1 = payload.periodization?.weeks?.[0];
              // Quando periodização ativa, pré-preenche campos vazios com valores da Semana 1
              const effSets    = ex.sets    || (periodOn && w1?.sets    ? w1.sets    : "");
              const effReps    = ex.reps    || (periodOn && w1?.reps    ? w1.reps    : "");
              const effCadence = ex.cadence || (periodOn && w1?.cadence ? w1.cadence : "");
              const effRest    = ex.rest    || (periodOn && w1?.rest    ? w1.rest    : "");
              const phSets    = periodOn && w1?.sets    ? `S1: ${w1.sets}`    : "Séries (Ex: 4)";
              const phReps    = periodOn && w1?.reps    ? `S1: ${w1.reps}`    : "Reps (Ex: 8-12)";
              const phCadence = periodOn && w1?.cadence ? `S1: ${w1.cadence}` : "Ex: 3010";
              const phRest    = periodOn && w1?.rest    ? `S1: ${w1.rest}`    : "Descanso (Ex: 60s)";
              const collapsed = periodOn && !overrideOpen[di];
              return (
              <div key={ei} className={cn(
                "grid grid-cols-2 gap-2 items-center",
                collapsed
                  ? "md:grid-cols-[1.8fr_1fr_auto]"
                  : "md:grid-cols-[1.8fr_0.6fr_0.6fr_0.6fr_0.6fr_1fr_auto]"
              )}>
                <ExercisePickerInput
                  value={ex.name}
                  gifKey={(ex as any).gifKey}
                  onChange={(patch) => updEx(di, ei, patch)}
                  placeholder="Ex: Supino reto"
                />
                {!collapsed && (
                  <>
                    <Input value={effSets} onChange={(e) => updEx(di, ei, { sets: e.target.value })} placeholder={phSets} className={cn("h-8 text-xs", periodOn && !ex.sets && effSets ? "text-muted-foreground italic" : "")} title={periodOn && !ex.sets ? "Valor da Semana 1 — edite para personalizar" : ""} />
                    <Input value={effReps} onChange={(e) => updEx(di, ei, { reps: e.target.value })} placeholder={phReps} className={cn("h-8 text-xs", periodOn && !ex.reps && effReps ? "text-muted-foreground italic" : "")} title={periodOn && !ex.reps ? "Valor da Semana 1 — edite para personalizar" : ""} />
                    <Input value={effCadence} onChange={(e) => updEx(di, ei, { cadence: e.target.value })} placeholder={phCadence} className={cn("h-8 text-xs", periodOn && !ex.cadence && effCadence ? "text-muted-foreground italic" : "")} title="3010 = Excêntrico / Pausa / Concêntrico / Pausa" />
                    <Input value={effRest} onChange={(e) => updEx(di, ei, { rest: e.target.value })} placeholder={phRest} className={cn("h-8 text-xs", periodOn && !ex.rest && effRest ? "text-muted-foreground italic" : "")} title={periodOn && !ex.rest ? "Valor da Semana 1 — edite para personalizar" : ""} />
                  </>
                )}
                <Input value={ex.notes} onChange={(e) => updEx(di, ei, { notes: e.target.value })} placeholder="Obs" className="h-8 text-xs" />
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveExercise(di, ei, "up")}
                    disabled={ei === 0}
                    className="text-muted-foreground hover:text-primary p-1 disabled:opacity-30"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExercise(di, ei, "down")}
                    disabled={ei === day.exercises.length - 1}
                    className="text-muted-foreground hover:text-primary p-1 disabled:opacity-30"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => updDay(di, { exercises: day.exercises.filter((_, i) => i !== ei) })} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              );
            })}
            <div className="flex flex-wrap gap-2 mt-1">
              <Button size="sm" variant="outline" onClick={() => updDay(di, { exercises: [...day.exercises, makeEmptyExercise()] })} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" /> Exercício</Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setPayload({
                    ...payload,
                    cardio: [
                      ...(payload.cardio ?? []),
                      {
                        type: "",
                        duration: "",
                        intensity: "",
                        workoutKey: day.key,
                        associationType: "workout" as const,
                        notes: "",
                      },
                    ],
                  })
                }
              >
                <Activity className="w-3 h-3 mr-1" /> Aeróbico neste treino
              </Button>
            </div>

            {(payload.cardio ?? []).filter((c) => c.workoutKey === day.key && c.associationType === "workout").length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" /> Aeróbico do Treino {day.key}
                </p>
                {(payload.cardio ?? []).map((c, ci) => {
                  if (c.workoutKey !== day.key || c.associationType !== "workout") return null;
                  return (
                    <div key={ci} className="bg-background border border-border/50 rounded-lg p-2 space-y-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <Select
                          value={c.type || "Outro"}
                          onValueChange={(v) => {
                            const n = [...(payload.cardio ?? [])];
                            n[ci] = { ...n[ci], type: v };
                            setPayload({ ...payload, cardio: n });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                          <SelectContent>
                            {["AEJ","LISS","HIIT","Caminhada","Bicicleta","Outro"].map((t) => (
                              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => setPayload({ ...payload, cardio: (payload.cardio ?? []).filter((_, j) => j !== ci) })}
                          className="text-muted-foreground hover:text-destructive p-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Duração</Label>
                          <Input
                            value={c.duration}
                            onChange={(e) => {
                              const n = [...(payload.cardio ?? [])];
                              n[ci] = { ...n[ci], duration: e.target.value };
                              setPayload({ ...payload, cardio: n });
                            }}
                            placeholder="40 min"
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase text-muted-foreground">Intensidade</Label>
                          <Select
                            value={c.intensity || "Moderada"}
                            onValueChange={(v) => {
                              const n = [...(payload.cardio ?? [])];
                              n[ci] = { ...n[ci], intensity: v };
                              setPayload({ ...payload, cardio: n });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["Leve","Moderada","Alta"].map((t) => (
                                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Input
                        value={c.notes}
                        onChange={(e) => {
                          const n = [...(payload.cardio ?? [])];
                          n[ci] = { ...n[ci], notes: e.target.value };
                          setPayload({ ...payload, cardio: n });
                        }}
                        placeholder="Observações do aeróbico"
                        className="h-8 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            )}
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

function DietTab({ payload, setPayload }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void }) {
  const [coachId, setCoachId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setCoachId(data.session?.user?.id ?? null)); }, []);

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
    if (patch.isTaco === true) {
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

      {payload.meals.map((m, mealIdx) => {
        const isCollapsed = !!collapsedMeals[mealIdx];
        const mealM = calcMealMacros(m);
        return (
        <Card key={mealIdx} className={`bg-card/60 border-border ${isCollapsed ? "overflow-hidden" : "overflow-visible relative focus-within:z-50"}`}>
          <div className={`flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/10 ${isCollapsed ? "" : "rounded-t-xl"}`}>
            <Input
              list="meal-name-presets"
              value={m.name}
              onChange={(e) => updMealField(mealIdx, { name: e.target.value })}
              placeholder="Nome (Café, Almoço...)"
              className="h-8 text-sm font-bold text-primary flex-1"
            />
            <Input value={m.time} onChange={(e) => updMealField(mealIdx, { time: e.target.value })} placeholder="07:00" className="h-8 text-sm w-20 shrink-0" />
            {isCollapsed && mealM.kcal > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-muted/40 border border-border/40">
                {Math.round(mealM.kcal)} kcal
              </span>
            )}
            {payload.setup.carbCycle && (
              <button type="button"
                onClick={() => updMealField(mealIdx, { carbCycle: !(m as any).carbCycle } as any)}
                className={`h-8 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 ${(m as any).carbCycle ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500" : "border-border/50 text-muted-foreground"}`}>
                <TrendingUp className="w-3.5 h-3.5" /> Ciclo
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
                              <button type="button" onClick={() => removeOption(mealIdx, kind, optIdx)} className="text-muted-foreground hover:text-destructive p-0.5 shrink-0"><Trash2 className="w-3 h-3" /></button>
                            )}
                          </div>
                          <Input value={(opt as any).notes || ""} onChange={(e) => updOption(mealIdx, kind, optIdx, { notes: e.target.value })} placeholder="Observação (ex: usar nos dias de treino pesado)" className="h-6 text-[11px] w-full bg-transparent border-0 border-b border-dashed rounded-none px-1 mb-2 text-muted-foreground" />

                          <div className="space-y-1.5">
                            {items.map((it: any, ii: number) => (
                              <div key={ii} className="relative focus-within:z-[70] bg-background rounded border border-border/40 px-2 py-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">
                                    {(it as any).optional ? "⚡ Opcional (não soma)" : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => updItem(mealIdx, kind, optIdx, ii, { optional: !(it as any).optional })}
                                    className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${(it as any).optional ? "bg-amber-500/15 border-amber-500/40 text-amber-600 font-bold" : "border-border/50 text-muted-foreground hover:border-amber-400 hover:text-amber-500"}`}
                                    title="Marcar como opcional — não entra no cálculo de kcal"
                                  >
                                    {(it as any).optional ? "✓ Opcional" : "Opcional?"}
                                  </button>
                                </div>
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
        );
      })}
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
