// TemplateLibraryDialog — fonte única de templates.
//  - protocols (is_template=true) → protocolo completo do coach E os templates
//    de sistema migrados de SYSTEM_TEMPLATES (coach_id/student_id NULL,
//    template_source = 'system_reference'). Este é o sistema oficial.
//  - workout_templates            → LEGADO SOMENTE-LEITURA (RLS já bloqueia
//    novas inserções). Os registros existentes continuam listáveis/aplicáveis.
//  - meal_templates               → refeição individual
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, BookmarkPlus, Trash2, Dumbbell, Utensils, FileText, ClipboardList, Eye, History, Pencil } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { ProtocolPayloadSchema, type ProtocolPayload, genItemId } from "@/lib/protocolSchema";
import { checkMuscleRecovery } from "@/lib/muscleRecovery";
import TemplateHistoryDialog from "./TemplateHistoryDialog";
import { cn } from "@/lib/utils";
import { saveProtocolAsTemplate } from "@/lib/protocolTemplates";

type TplType = "workout" | "meal" | "protocol";
type TplItem = {
  id: string;
  type: TplType;
  name: string;
  createdAt: string;
  raw: any;
  isSystem?: boolean;
  isLegacy?: boolean;
  division?: string;
  profile?: string;
};

const TYPE_META: Record<TplType, { label: string; icon: any; badge: string }> = {
  workout:  { label: "Treino",              icon: Dumbbell,      badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  meal:     { label: "Refeição",            icon: Utensils,      badge: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  protocol: { label: "Protocolo completo",  icon: ClipboardList, badge: "bg-primary/15 text-primary border-primary/40" },
};

const DIVISIONS = ["todos", "AB", "ABC", "ABCD", "ABCDE"] as const;
const PROFILES: { value: string; label: string }[] = [
  { value: "todos",                       label: "Todos os perfis" },
  { value: "masculino_geral",             label: "Masculino Geral" },
  { value: "masculino_posterior",         label: "Masculino Posterior" },
  { value: "masculino_foco_biceps",       label: "Masculino Foco Bíceps" },
  { value: "masculino_foco_peito",        label: "Masculino Foco Peito" },
  { value: "masculino_foco_pernas",       label: "Masculino Foco Pernas" },
  { value: "masculino_ombro_epicondilite",label: "Masculino Ombro/Epicondilite" },
  { value: "feminino_gluteo",             label: "Feminino Glúteo" },
  { value: "feminino_femoral_gluteo",     label: "Feminino Femoral/Glúteo" },
  { value: "feminino_quadriceps_gluteo",  label: "Feminino Quadríceps/Glúteo" },
  { value: "feminino_musculatura",        label: "Feminino Musculatura" },
  { value: "feminino_superior_ombro",     label: "Feminino Superior/Ombro" },
  { value: "reabilitacao_ombro",          label: "Reabilitação de Ombro" },
  { value: "reabilitacao_joelho_lombar",  label: "Reabilitação Joelho/Lombar" },
];

export default function TemplateLibraryDialog({
  open, onOpenChange, coachId, payload, setPayload, protocolName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachId: string | null;
  payload: ProtocolPayload | null;
  setPayload: (p: ProtocolPayload) => void;
  protocolName: string;
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TplItem[]>([]);
  const [filter, setFilter] = useState<"all" | TplType>("all");
  const [filterDiv, setFilterDiv] = useState<string>("todos");
  const [filterProfile, setFilterProfile] = useState<string>("todos");
  const [saveOpen, setSaveOpen] = useState<null | "protocol">(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [historyItem, setHistoryItem] = useState<{ id: string; name: string } | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{ id: string; name: string } | null>(null);


  async function reload() {
    if (!coachId) return;
    setLoading(true);
    try {
      const [workoutRes, mealRes, protoRes, systemRes] = await Promise.all([
        supabase.from("workout_templates")
          .select("id, name, treinos, created_at")
          .eq("created_by", coachId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("meal_templates")
          .select("id, name, kind, meal_data, created_at")
          .eq("coach_id", coachId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("protocols")
          .select("id, name, payload, created_at")
          .eq("coach_id", coachId)
          .eq("is_template", true)
          .order("created_at", { ascending: false })
          .limit(50),
        // Templates de sistema migrados para protocols (conteúdo de referência).
        (supabase.from("protocols") as any)
          .select("id, name, payload, created_at, template_profile, template_division")
          .eq("is_template", true)
          .eq("template_source", "system_reference")
          .order("name", { ascending: true })
          .limit(100),
      ]);

      const merged: TplItem[] = [
        ...(workoutRes.data ?? []).map((r) => ({ id: r.id, type: "workout" as const, name: r.name, createdAt: r.created_at, raw: r, isSystem: false, isLegacy: true })),
        ...(mealRes.data ?? []).map((r) => ({ id: r.id, type: "meal" as const, name: r.name, createdAt: r.created_at, raw: r })),
        ...(protoRes.data ?? []).map((r) => ({ id: r.id, type: "protocol" as const, name: r.name, createdAt: r.created_at, raw: r })),
        ...((systemRes.data ?? []) as any[]).map((r): TplItem => ({
          id: r.id,
          type: "workout",
          name: r.name,
          createdAt: "",
          raw: { treinos: { scope: "full", workouts: r.payload?.workouts ?? [] } },
          isSystem: true,
          division: r.template_division ?? undefined,
          profile: r.template_profile ?? undefined,
        })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setItems(merged);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) reload(); /* eslint-disable-next-line */ }, [open, coachId]);

  const filtered = useMemo(() => {
    let list = filter === "all" ? items : items.filter((i) => i.type === filter);
    if (filter === "workout") {
      list = list.filter((i) =>
        (filterDiv === "todos" || i.division === filterDiv) &&
        (filterProfile === "todos" || i.profile === filterProfile)
      );
    }
    return list;
  }, [items, filter, filterDiv, filterProfile]);

  async function applyItem(item: TplItem, mode: "filled" | "empty" = "filled") {
    if (!payload) return;
    if (item.type === "workout") {
      const treinos = item.raw.treinos || {};
      const parsedBlock = WorkoutBlockPayloadSchema.safeParse({
        scope: "workouts",
        workouts: treinos.workouts ?? [],
        periodization: treinos.periodization,
      });
      if (!parsedBlock.success || parsedBlock.data.workouts.length === 0) {
        toast.error("Template sem dias de treino salvos");
        return;
      }
      setPayload(injectWorkoutBlock(payload, parsedBlock.data, mode));
      toast.success(mode === "filled" ? "Treino aplicado com exercícios" : "Estrutura aplicada — adicione seus exercícios");
    } else if (item.type === "meal") {
      const meal = item.raw.meal_data;
      setPayload({ ...payload, meals: [...payload.meals, { ...meal, name: meal?.name || item.name, __id: genItemId("meal") }] });
      toast.success("Refeição adicionada");
    } else {
      if (!(await confirm({
        title: "Aplicar protocolo completo",
        description: "Isso substitui treino, dieta, suplementos e macros pelos deste template. Continuar?",
        destructive: true,
        confirmLabel: "Aplicar",
      }))) return;
      const parsed = ProtocolPayloadSchema.safeParse(item.raw.payload);
      if (!parsed.success) { toast.error("Template com payload inválido"); return; }
      setPayload(parsed.data);
      toast.success("Protocolo aplicado");
    }
    onOpenChange(false);
  }

  async function deleteItem(item: TplItem) {
    if (item.isSystem) return;
    if (!(await confirm({
      title: `Excluir template`,
      description: `Excluir "${item.name}"? Essa ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: "Excluir",
    }))) return;
    try {
      if (item.type === "workout" && !item.isLegacy) {
        if (!coachId) return;
        await deleteWorkoutBlockTemplate(item.id, coachId);
      } else {
        const table = item.type === "workout" ? "workout_templates"
                    : item.type === "meal"    ? "meal_templates"
                    :                            "protocols";
        const { error } = await supabase.from(table).delete().eq("id", item.id);
        if (error) throw error;
      }
      toast.success("Template excluído");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir");
    }
  }

  /** Carrega o template no builder e entra em modo edição (próximo salvar = UPDATE). */
  async function editItem(item: TplItem) {
    if (!payload || item.isSystem || item.type !== "protocol") return;
    if (!(await confirm({
      title: "Editar template no builder",
      description: "Isso substitui TODO o conteúdo atual (treino, dieta, suplementos e macros) pelo do template. Se você estava editando o protocolo de um aluno, essa edição em andamento será perdida. Continuar?",
      destructive: true,
      confirmLabel: "Carregar template",
    }))) return;
    const parsed = ProtocolPayloadSchema.safeParse(item.raw.payload);
    if (!parsed.success) { toast.error("Template com payload inválido"); return; }
    setPayload(parsed.data);
    setEditingTemplate({ id: item.id, name: item.name });
    onOpenChange(false);
    toast.success(`Editando "${item.name}" — ajuste e clique em Salvar protocolo`);
  }

  async function saveProtocolTemplate() {
    if (!coachId || !payload) return;
    const trimmed = saveName.trim();
    if (!trimmed) { toast.error("Dê um nome"); return; }
    setSaving(true);
    try {
      if (editingTemplate) {
        const parsed = ProtocolPayloadSchema.parse(payload);
        const { error } = await supabase
          .from("protocols")
          .update({ name: trimmed, payload: parsed as any })
          .eq("id", editingTemplate.id)
          .eq("is_template", true);
        if (error) throw error;
        toast.success("Template atualizado");
        setEditingTemplate(null);
      } else {
        await saveProtocolAsTemplate(coachId, trimmed, payload);
        toast.success("Protocolo salvo como template");
      }
      setSaveOpen(null);
      setSaveName("");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally { setSaving(false); }
  }


  function restoreFromVersion(treinos: any) {
    if (!payload) return;
    const next = { ...payload };
    if (treinos?.workouts) next.workouts = treinos.workouts;
    if (treinos?.periodization) next.periodization = treinos.periodization;
    setPayload(next);
    toast.success("Versão restaurada");
  }

  function renderTemplatePreview(item: TplItem) {
    if (item.type === "workout") {
      const treinos = item.raw.treinos || {};
      const workouts = Array.isArray(treinos.workouts) ? treinos.workouts : [];
      if (workouts.length === 0) return <p className="text-[11px] text-muted-foreground">Sem dias de treino salvos.</p>;
      const warnings = checkMuscleRecovery(workouts.map((w: any) => ({ key: w.key || "", focus: w.focus || "" })));
      return (
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground space-y-1">
            {workouts.map((w: any, i: number) => (
              <p key={i}>
                <span className="font-medium text-foreground">{w.key}{w.focus ? ` — ${w.focus}` : ""}:</span>{" "}
                {(w.exercises || []).map((e: any) => e.name).filter(Boolean).join(", ") || "sem exercícios"}
              </p>
            ))}
          </div>
          {warnings.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
              <p className="text-[10px] font-bold text-amber-500 mb-1">⚠ Aviso de recuperação muscular</p>
              {warnings.map((w, i) => <p key={i} className="text-[10px] text-amber-600">{w}</p>)}
            </div>
          ) : workouts.length > 1 ? (
            <p className="text-[10px] text-emerald-500">✓ Recuperação muscular adequada entre os dias.</p>
          ) : null}
        </div>
      );
    }
    if (item.type === "meal") {
      const meal = item.raw.meal_data || {};
      const macros = meal.macros || {};
      return (
        <div className="text-[11px] text-muted-foreground space-y-1">
          <p>Macros: {macros.protein ?? 0}g P · {macros.carbs ?? 0}g C · {macros.fat ?? 0}g G</p>
          <p>{(meal.options?.length ?? 0)} opção(ões) de refeição{meal.notes ? ` — ${meal.notes}` : ""}</p>
        </div>
      );
    }
    const p = item.raw.payload || {};
    const macros = p.macros || {};
    return (
      <div className="text-[11px] text-muted-foreground space-y-1">
        <p>Macros: {macros.calories ?? "—"} kcal · {macros.protein ?? 0}g P · {macros.carbs ?? 0}g C · {macros.fat ?? 0}g G</p>
        <p>{(p.workouts?.length ?? 0)} dia(s) de treino · {(p.meals?.length ?? 0)} refeição(ões)</p>
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Biblioteca de Templates</DialogTitle>
            <DialogDescription className="text-xs">
              Treinos, refeições e protocolos salvos por você — e uma biblioteca de treinos prontos do sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/40">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full sm:w-auto">
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs h-6">Todos</TabsTrigger>
                <TabsTrigger value="workout" className="text-xs h-6">Treino</TabsTrigger>
                <TabsTrigger value="meal" className="text-xs h-6">Refeição</TabsTrigger>
                <TabsTrigger value="protocol" className="text-xs h-6">Protocolo</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2 sm:ml-auto">
              {editingTemplate && (
                <span className="text-[10px] font-bold px-2 py-1 rounded border bg-amber-500/10 text-amber-600 border-amber-500/30 flex items-center gap-1">
                  Editando: {editingTemplate.name}
                  <button className="underline" onClick={() => setEditingTemplate(null)}>cancelar</button>
                </span>
              )}
              <Button
                size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => { setSaveName(editingTemplate?.name || protocolName || "Protocolo"); setSaveOpen("protocol"); }}
                disabled={!payload}
              >
                <BookmarkPlus className="w-3.5 h-3.5 mr-1" /> {editingTemplate ? "Atualizar template" : "Salvar protocolo"}
              </Button>
            </div>
          </div>


          {filter === "workout" && (
            <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border/40">
              {DIVISIONS.map((d) => (
                <button
                  key={d} type="button" onClick={() => setFilterDiv(d)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-bold border transition",
                    filterDiv === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {d === "todos" ? "Todas divisões" : d}
                </button>
              ))}
              <span className="w-px bg-border/60 mx-1" />
              {PROFILES.map((pf) => (
                <button
                  key={pf.value} type="button" onClick={() => setFilterProfile(pf.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-bold border transition",
                    filterProfile === pf.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {pf.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto -mx-1 px-1 py-2">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum template {filter === "all" ? "" : `de ${TYPE_META[filter as TplType].label.toLowerCase()} `}salvo ainda.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((item) => {
                  const meta = TYPE_META[item.type];
                  const Icon = meta.icon;
                  const key = `${item.type}:${item.id}`;
                  return (
                    <li key={key} className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.badge}`}>
                              {meta.label}
                            </span>
                            {item.division && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                                {item.division}
                              </span>
                            )}
                            {item.isSystem ? (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30"
                                title="Conteúdo de referência (base ACSM/NSCA/Schoenfeld/Contreras) — não é a metodologia oficial do projeto."
                              >
                                Referência
                              </span>
                            ) : item.isLegacy ? (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-muted text-muted-foreground"
                                title="Biblioteca antiga, somente leitura. Novos templates devem ser salvos como protocolo."
                              >
                                Legado
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-600 border-amber-500/30">
                                Seu
                              </span>
                            )}
                          </div>
                          {item.createdAt && (
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setExpandedKey(expandedKey === key ? null : key)}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Pré-visualizar"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {item.type === "workout" ? (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" title="Aplicar com exercícios" onClick={() => applyItem(item, "filled")}>
                              ▶
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" title="Aplicar só a estrutura (sem exercícios)" onClick={() => applyItem(item, "empty")}>
                              ○
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyItem(item)}>
                            Aplicar
                          </Button>
                        )}
                        {item.type === "workout" && !item.isSystem && item.isLegacy && (
                          <button
                            onClick={() => setHistoryItem({ id: item.id, name: item.name })}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Histórico de versões"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.type === "workout" && !item.isSystem && !item.isLegacy && (
                          <button
                            onClick={() => setBlockHistoryItem({ id: item.id, name: item.name })}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Histórico de versões"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.type === "protocol" && !item.isSystem && (
                          <button
                            onClick={() => editItem(item)}
                            className="text-muted-foreground hover:text-primary p-1"
                            title="Editar template"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!item.isSystem && (
                          <button
                            onClick={() => deleteItem(item)}
                            className="text-muted-foreground hover:text-destructive p-1"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                      </div>
                      {expandedKey === key && (
                        <div className="mt-2 pt-2 border-t border-border/40">
                          {renderTemplatePreview(item)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!saveOpen} onOpenChange={(v) => !v && setSaveOpen(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Salvar protocolo como template</DialogTitle>
            <DialogDescription className="text-xs">
              Guarda o protocolo completo (treino, dieta, suplementos, macros) na sua biblioteca.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <Button
              onClick={saveProtocolTemplate}
              disabled={saving}
              className="w-full"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TemplateHistoryDialog
        open={!!historyItem}
        onOpenChange={(v) => !v && setHistoryItem(null)}
        templateId={historyItem?.id ?? null}
        templateName={historyItem?.name ?? ""}
        onRestore={restoreFromVersion}
      />
      {blockHistoryItem && coachId && (
        <WorkoutBlockHistoryDialog
          open={!!blockHistoryItem}
          onOpenChange={(v) => !v && setBlockHistoryItem(null)}
          templateId={blockHistoryItem.id}
          templateName={blockHistoryItem.name}
          coachId={coachId}
          onRestored={reload}
        />
      )}
    </>
  );
}
