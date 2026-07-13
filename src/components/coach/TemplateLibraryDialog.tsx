// TemplateLibraryDialog — Fase 4 do refactor do ProtocolBuilder.
// Ponto único de entrada para as 3 fontes de template já existentes:
//  - protocols (is_template=true) → protocolo completo
//  - workout_templates            → treino + periodização
//  - meal_templates               → refeição individual
// Reaproveita a lógica de salvar/aplicar/excluir de cada fonte;
// aqui só reorganizamos onde os botões aparecem.
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
import { Loader2, BookmarkPlus, Trash2, Dumbbell, Utensils, FileText, ClipboardList } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";

type TplType = "workout" | "meal" | "protocol";
type TplItem = {
  id: string;
  type: TplType;
  name: string;
  createdAt: string;
  raw: any;
};

const TYPE_META: Record<TplType, { label: string; icon: any; badge: string }> = {
  workout:  { label: "Treino",              icon: Dumbbell,      badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  meal:     { label: "Refeição",            icon: Utensils,      badge: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  protocol: { label: "Protocolo completo",  icon: ClipboardList, badge: "bg-primary/15 text-primary border-primary/40" },
};

const MAX_WORKOUT_TEMPLATES = 30;

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
  const [saveOpen, setSaveOpen] = useState<null | "workout" | "protocol">(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    if (!coachId) return;
    setLoading(true);
    try {
      const [workoutRes, mealRes, protoRes] = await Promise.all([
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
      ]);

      const merged: TplItem[] = [
        ...(workoutRes.data ?? []).map((r) => ({ id: r.id, type: "workout" as const, name: r.name, createdAt: r.created_at, raw: r })),
        ...(mealRes.data ?? []).map((r) => ({ id: r.id, type: "meal" as const, name: r.name, createdAt: r.created_at, raw: r })),
        ...(protoRes.data ?? []).map((r) => ({ id: r.id, type: "protocol" as const, name: r.name, createdAt: r.created_at, raw: r })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setItems(merged);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) reload(); /* eslint-disable-next-line */ }, [open, coachId]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.type === filter)),
    [items, filter],
  );

  async function applyItem(item: TplItem) {
    if (!payload) return;
    if (item.type === "workout") {
      const treinos = item.raw.treinos || {};
      const next = { ...payload };
      if (Array.isArray(treinos.workouts) && treinos.workouts.length) next.workouts = treinos.workouts;
      if (treinos.periodization) next.periodization = treinos.periodization;
      setPayload(next);
      toast.success("Treino aplicado");
    } else if (item.type === "meal") {
      const meal = item.raw.meal_data;
      setPayload({ ...payload, meals: [...payload.meals, { ...meal, name: meal?.name || item.name }] });
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
    if (!(await confirm({
      title: `Excluir template`,
      description: `Excluir "${item.name}"? Essa ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: "Excluir",
    }))) return;
    const table = item.type === "workout" ? "workout_templates"
                : item.type === "meal"    ? "meal_templates"
                :                            "protocols";
    const { error } = await supabase.from(table).delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Template excluído");
    reload();
  }

  async function saveWorkoutTemplate() {
    if (!coachId || !payload) return;
    const trimmed = saveName.trim();
    if (!trimmed) { toast.error("Dê um nome"); return; }
    setSaving(true);
    try {
      const { count } = await supabase
        .from("workout_templates")
        .select("id", { count: "exact", head: true })
        .eq("created_by", coachId);
      if ((count ?? 0) >= MAX_WORKOUT_TEMPLATES) {
        toast.error(`Limite de ${MAX_WORKOUT_TEMPLATES} templates de treino atingido`);
        return;
      }
      const treinos = { workouts: payload.workouts, periodization: payload.periodization, scope: "full" };
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("user_id", coachId).maybeSingle();
      const authorName = prof?.full_name || "Coach";
      const { data: inserted, error } = await supabase.from("workout_templates").insert({
        created_by: coachId,
        updated_by: coachId,
        name: trimmed,
        level: "full",
        description: "Treino + Periodização",
        treinos,
      }).select("id").single();
      if (error) throw error;
      await supabase.from("workout_template_versions").insert({
        template_id: inserted.id,
        version: 1,
        scope: "full",
        name: trimmed,
        description: "Treino + Periodização",
        treinos,
        updated_by: coachId,
        updated_by_name: authorName,
      });
      toast.success("Template de treino salvo");
      setSaveOpen(null);
      setSaveName("");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally { setSaving(false); }
  }

  async function saveProtocolTemplate() {
    if (!coachId || !payload) return;
    const trimmed = saveName.trim();
    if (!trimmed) { toast.error("Dê um nome"); return; }
    setSaving(true);
    try {
      const parsed = ProtocolPayloadSchema.parse(payload);
      const { error } = await supabase.from("protocols").insert({
        coach_id: coachId,
        student_id: coachId, // templates ficam na conta do coach (sem aluno alvo)
        name: trimmed,
        is_template: true,
        payload: parsed,
        active: false,
      });
      if (error) throw error;
      toast.success("Protocolo salvo como template");
      setSaveOpen(null);
      setSaveName("");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally { setSaving(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Biblioteca de Templates</DialogTitle>
            <DialogDescription className="text-xs">
              Treinos, refeições e protocolos salvos por você.
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
              <Button
                size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => { setSaveName(protocolName || "Treino"); setSaveOpen("workout"); }}
                disabled={!payload}
              >
                <BookmarkPlus className="w-3.5 h-3.5 mr-1" /> Salvar treino atual
              </Button>
              <Button
                size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => { setSaveName(protocolName || "Protocolo"); setSaveOpen("protocol"); }}
                disabled={!payload}
              >
                <BookmarkPlus className="w-3.5 h-3.5 mr-1" /> Salvar protocolo
              </Button>
            </div>
          </div>

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
                  return (
                    <li key={`${item.type}:${item.id}`} className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => applyItem(item)}>
                        Aplicar
                      </Button>
                      <button
                        onClick={() => deleteItem(item)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
            <DialogTitle>
              {saveOpen === "workout" ? "Salvar treino atual como template" : "Salvar protocolo como template"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {saveOpen === "workout"
                ? "Guarda treinos + periodização atuais na sua biblioteca."
                : "Guarda o protocolo completo (treino, dieta, suplementos, macros) na sua biblioteca."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} className="h-9 text-sm mt-1" />
            </div>
            <Button
              onClick={saveOpen === "workout" ? saveWorkoutTemplate : saveProtocolTemplate}
              disabled={saving}
              className="w-full"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
