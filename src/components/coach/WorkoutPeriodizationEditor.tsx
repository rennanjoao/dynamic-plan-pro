import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, BookmarkPlus, Library, Loader2, Trash2,
  Eye, Copy, RefreshCcw, AlertCircle, History, ChevronDown, Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ProtocolPayloadSchema,
  PeriodizationSchema,
  type ProtocolPayload,
} from "@/lib/protocolSchema";
import { validatePeriodization } from "@/lib/periodizationValidation";
import WeekPreviewDialog from "./WeekPreviewDialog";
import TemplateHistoryDialog from "./TemplateHistoryDialog";
import { SYSTEM_TEMPLATES } from "@/data/workoutSystemTemplates";
import { cn } from "@/lib/utils";

// ─── Validação de recuperação muscular entre dias ────────────────────────────
// Mapeia palavras-chave do campo `focus` para grupos musculares
const MUSCLE_GROUPS: Record<string, string[]> = {
  "peito":    ["peito", "peitoral", "chest", "supino", "crucifixo"],
  "costas":   ["costas", "dorsal", "back", "puxada", "remada", "lat"],
  "ombro":    ["ombro", "deltóide", "deltoid", "shoulder", "desenvolvimento"],
  "biceps":   ["bíceps", "biceps", "rosca"],
  "triceps":  ["tríceps", "triceps", "trícep", "tricep", "paralela", "pulley"],
  "quadri":   ["quadríceps", "quadriceps", "agachamento", "leg press", "hack", "inferiores", "perna", "leg"],
  "posterior":["posterior", "femoral", "terra", "romeno", "stiff", "glúteo", "gluteo", "bumbum", "cadeia posterior"],
  "core":     ["core", "abdômen", "abdomen", "abdominal"],
};

// Grupos que precisam de pelo menos 48h entre sessões (antagonistas pesados)
const NEEDS_48H = ["peito","costas","ombro","quadri","posterior"];

function detectMuscleGroups(focus: string): string[] {
  const lower = (focus || "").toLowerCase();
  return Object.entries(MUSCLE_GROUPS)
    .filter(([, kws]) => kws.some((kw) => lower.includes(kw)))
    .map(([group]) => group);
}

/**
 * Retorna avisos de recuperação muscular inadequada para um array de workouts.
 * Assume que os dias se repetem ciclicamente (sem dia fixo da semana).
 */
function checkMuscleRecovery(workouts: Array<{ key: string; focus: string }>): string[] {
  const warnings: string[] = [];
  const n = workouts.length;
  if (n < 2) return warnings;

  for (let i = 0; i < n; i++) {
    const curr = workouts[i];
    const next = workouts[(i + 1) % n];
    const currGroups = detectMuscleGroups(curr.focus);
    const nextGroups = detectMuscleGroups(next.focus);

    const overlap = currGroups.filter((g) => nextGroups.includes(g) && NEEDS_48H.includes(g));
    if (overlap.length > 0) {
      const isWrap = i === n - 1;
      const label = isWrap
        ? `Treino ${curr.key} → retorno ao Treino ${next.key}`
        : `Treino ${curr.key} → Treino ${next.key}`;
      warnings.push(
        `${label}: grupo(s) ${overlap.map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(", ")} treinado(s) em dias consecutivos — recuperação insuficiente (mín. 48h).`
      );
    }
  }
  return warnings;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const MAX_TEMPLATES = 10;

interface Props {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
}

function exId(dayKey: string, idx: number) {
  return `${dayKey}_${idx}`;
}

export default function WorkoutPeriodizationEditor({ payload, setPayload, coachId }: Props) {
  const p = payload.periodization;
  const confirm = useConfirm();
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplScope, setTplScope] = useState<"full" | "periodization">("full");
  const [loadOpen, setLoadOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewWeek, setPreviewWeek] = useState<number | null>(null);
  const [historyTpl, setHistoryTpl] = useState<{ id: string; name: string } | null>(null);
  const [previewTpl, setPreviewTpl] = useState<any | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("perio_collapsed") === "true";
  });
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("perio_collapsed", String(next)); } catch { /* noop */ }
  };

  const validation = useMemo(() => validatePeriodization(payload), [payload]);
  const errorByWeek = useMemo(() => {
    const map: Record<number, Record<string, string>> = {};
    validation.weekErrors.forEach((e) => {
      map[e.weekIndex] = { ...(map[e.weekIndex] || {}), [e.field]: e.message };
    });
    return map;
  }, [validation]);
  const overrideErrSet = useMemo(() => {
    const s = new Set<string>();
    validation.overrideErrors.forEach((e) => s.add(`${e.weekIndex}|${e.exerciseId}|${e.field}`));
    return s;
  }, [validation]);

  const updateWeek = (i: number, field: keyof typeof p.weeks[number], value: string) => {
    const weeks = p.weeks.map((w, idx) => (idx === i ? { ...w, [field]: value } : w));
    setPayload({ ...payload, periodization: { ...p, weeks } });
  };

  const setOverride = (weekIdx: number, id: string, patch: Record<string, string>) => {
    const key = String(weekIdx);
    const next = { ...(p.overrides || {}) } as Record<string, Record<string, any>>;
    next[key] = { ...(next[key] || {}), [id]: { ...(next[key]?.[id] || {}), ...patch } };
    // limpa entradas vazias
    Object.keys(next[key][id]).forEach((k) => {
      if (!next[key][id][k]) delete next[key][id][k];
    });
    if (Object.keys(next[key][id]).length === 0) delete next[key][id];
    setPayload({ ...payload, periodization: { ...p, overrides: next } });
  };

  function duplicateWeek(from: number, to: number) {
    if (from === to) return;
    const weeks = p.weeks.map((w, idx) => (idx === to ? { ...p.weeks[from], label: w.label } : w));
    const overrides = { ...(p.overrides || {}) };
    overrides[String(to)] = JSON.parse(JSON.stringify(overrides[String(from)] || {}));
    setPayload({ ...payload, periodization: { ...p, weeks, overrides } });
    toast.success(`Semana ${from + 1} copiada para Semana ${to + 1}`);
  }

  function resetWeekToDefault(i: number) {
    const defaults = PeriodizationSchema.parse({}).weeks;
    const weeks = p.weeks.map((w, idx) => (idx === i ? defaults[i] : w));
    const overrides = { ...(p.overrides || {}) };
    delete overrides[String(i)];
    setPayload({ ...payload, periodization: { ...p, weeks, overrides } });
    toast.success(`Semana ${i + 1} restaurada ao padrão`);
  }

  async function resetAllToDefault() {
    if (!(await confirm({ title: "Resetar periodização", description: "Resetar todas as 4 semanas e overrides para o padrão?", destructive: true, confirmLabel: "Resetar" }))) return;
    const fresh = PeriodizationSchema.parse({ enabled: p.enabled });
    setPayload({ ...payload, periodization: fresh });
    toast.success("Periodização restaurada ao padrão");
  }

  async function reloadTemplates() {
    if (!coachId) return;
    const { data } = await sb
      .from("workout_templates")
      .select("*")
      .eq("created_by", coachId)
      .order("created_at", { ascending: false })
      .limit(50);
    setTemplates(data || []);
  }

  async function openLoad() {
    setLoadOpen(true);
    await reloadTemplates();
  }

  async function persistTemplate() {
    if (!coachId) return;
    if (!tplName.trim()) { toast.error("Dê um nome ao template"); return; }
    if (p.enabled && !validation.ok) {
      toast.error("Corrija os erros da periodização antes de salvar.");
      return;
    }
    // valida payload completo via Zod
    const parsed = ProtocolPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error("JSON inválido: " + parsed.error.issues[0]?.message);
      return;
    }
    setBusy(true);
    try {
      const { count } = await sb
        .from("workout_templates")
        .select("id", { count: "exact", head: true })
        .eq("created_by", coachId);
      if ((count ?? 0) >= MAX_TEMPLATES) {
        toast.error(`Limite de ${MAX_TEMPLATES} templates atingido`);
        return;
      }
      const treinos = tplScope === "full"
        ? { workouts: parsed.data.workouts, periodization: parsed.data.periodization, scope: "full" }
        : { periodization: parsed.data.periodization, scope: "periodization" };

      // resolve nome do autor para o histórico
      const { data: prof } = await sb.from("profiles").select("full_name").eq("user_id", coachId).maybeSingle();
      const authorName = prof?.full_name || "Coach";

      const { data: inserted, error } = await sb.from("workout_templates").insert({
        created_by: coachId,
        updated_by: coachId,
        name: tplName.trim(),
        level: tplScope,
        description: tplScope === "full" ? "Treino + Periodização" : "Periodização",
        treinos,
      }).select("id").single();
      if (error) throw error;

      // cria versão 1
      await sb.from("workout_template_versions").insert({
        template_id: inserted.id,
        version: 1,
        scope: tplScope,
        name: tplName.trim(),
        description: tplScope === "full" ? "Treino + Periodização" : "Periodização",
        treinos,
        updated_by: coachId,
        updated_by_name: authorName,
      });

      toast.success("Template salvo (v1)");
      setSaveOpen(false);
      setTplName("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally { setBusy(false); }
  }

  function applyTemplate(tpl: any) {
    const data = tpl.treinos || {};
    const next = { ...payload };
    if (data.workouts) next.workouts = data.workouts;
    if (data.periodization) next.periodization = data.periodization;
    setPayload(next);
    toast.success("Template aplicado");
    setLoadOpen(false);
  }

  async function deleteTemplate(id: string) {
    if (!(await confirm({ title: "Excluir template", description: "Excluir este template?", destructive: true, confirmLabel: "Excluir" }))) return;
    const { error } = await sb.from("workout_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  async function applyTemplateAsNewVersion(tpl: any) {
    // aplica o template e cria nova versão refletindo o estado atual após aplicar
    applyTemplate(tpl);
  }

  function restoreFromVersion(treinos: any) {
    const next = { ...payload };
    if (treinos?.workouts) next.workouts = treinos.workouts;
    if (treinos?.periodization) next.periodization = treinos.periodization;
    setPayload(next);
    toast.success("Versão restaurada");
  }

  return (
    <Card className="bg-card/60 border-border p-4">
      {p.enabled && collapsed ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Periodização ativa — {p.weeks.length} semanas
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {p.weeks.map((w, i) => `S${i + 1}: ${w.sets || "?"}×${w.reps || "?"}`).join(" · ")}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-primary flex items-center gap-1 shrink-0">
            <ChevronDown className="w-3.5 h-3.5" /> Expandir
          </span>
        </button>
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Periodização (4 semanas)</Label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p.enabled && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetAllToDefault}>
              <RefreshCcw className="w-3 h-3 mr-1" /> Resetar tudo
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openLoad}>
            <Library className="w-3 h-3 mr-1" /> Carregar template
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="w-3 h-3 mr-1" /> Salvar template
          </Button>
          <div className="flex items-center gap-2 pl-2 border-l border-border/40">
            <Switch
              id="periodization-enabled"
              checked={p.enabled}
              onCheckedChange={(v) => setPayload({ ...payload, periodization: { ...p, enabled: v } })}
            />
            <Label htmlFor="periodization-enabled" className="text-xs cursor-pointer">
              {p.enabled ? "Ativada" : "Desativada"}
            </Label>
          </div>
        </div>
      </div>
      {p.enabled && (
        <div className="flex justify-end mb-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleCollapsed}>
            <Minimize2 className="w-3 h-3 mr-1" /> Minimizar periodização
          </Button>
        </div>
      )}

      {p.enabled && (
        <>
          <p className="text-[11px] text-muted-foreground mb-3">
            O aluno verá as 4 semanas. Os exercícios da aba Treino servem de base e podem ser
            substituídos por semana abaixo.
          </p>

          {!validation.ok && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 mb-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-[11px] text-destructive">
                {validation.weekErrors.length + validation.overrideErrors.length} erro(s) na periodização.
                Corrija antes de salvar.
              </div>
            </div>
          )}

          {/* Avisos de recuperação muscular */}
          {(() => {
            const muscleWarnings = checkMuscleRecovery(
              (payload.workouts || []).map((w) => ({ key: w.key || "", focus: w.focus || "" }))
            );
            return muscleWarnings.length > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 mb-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-bold text-amber-500">Aviso de recuperação muscular</p>
                </div>
                <ul className="space-y-0.5">
                  {muscleWarnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-amber-600">{w}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {/* Editor de metadados das 4 semanas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {p.weeks.map((w, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={w.label}
                    onChange={(e) => updateWeek(i, "label", e.target.value)}
                    className={cn("h-8 text-xs font-bold", errorByWeek[i]?.label && "border-destructive")}
                    placeholder={`Semana ${i + 1}`}
                  />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Prévia" onClick={() => setPreviewWeek(i)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Resetar padrão" onClick={() => resetWeekToDefault(i)}>
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {errorByWeek[i]?.label && (
                  <p className="text-[10px] text-destructive">{errorByWeek[i].label}</p>
                )}

                <div className="flex items-center gap-2">
                  <Copy className="w-3 h-3 text-muted-foreground" />
                  <Select onValueChange={(v) => duplicateWeek(Number(v), i)}>
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue placeholder="Copiar de outra semana…" />
                    </SelectTrigger>
                    <SelectContent>
                      {p.weeks.map((_, k) =>
                        k === i ? null : (
                          <SelectItem key={k} value={String(k)} className="text-xs">
                            Copiar Semana {k + 1}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(["sets", "reps", "rest", "cadence"] as const).map((f) => (
                    <div key={f}>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        {f === "sets" ? "Séries" : f === "reps" ? "Reps" : f === "rest" ? "Descanso" : "Cadência"}
                      </Label>
                      <Input
                        value={w[f]}
                        onChange={(e) => updateWeek(i, f, e.target.value)}
                        className={cn("h-8 text-xs mt-1", errorByWeek[i]?.[f] && "border-destructive")}
                      />
                      {errorByWeek[i]?.[f] && (
                        <p className="text-[10px] text-destructive mt-0.5">{errorByWeek[i][f]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Overrides por semana (semanas 2..4 substituem a base, mas a 1 também pode ser editada) */}
          <Accordion type="multiple" className="space-y-2">
            {p.weeks.map((w, weekIdx) => (
              <AccordionItem key={weekIdx} value={`w-${weekIdx}`} className="border border-border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline hover:bg-muted/30">
                  Substituições — {w.label || `Semana ${weekIdx + 1}`}
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3 space-y-3 pt-2 border-t border-border/40">
                  {payload.workouts.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">Nenhum exercício na aba Treino ainda.</p>
                  )}
                  {payload.workouts.map((day) => (
                    <div key={day.key} className="rounded-md border border-border/40 bg-background/40 p-2">
                      <p className="text-[11px] font-bold uppercase text-primary mb-2">Treino {day.key}</p>
                      <div className="space-y-2">
                        {(day.exercises || []).map((ex, ei) => {
                          const id = exId(day.key, ei);
                          const ov = (p.overrides?.[String(weekIdx)]?.[id]) || {};
                          const ovErr = (f: string) => overrideErrSet.has(`${weekIdx}|${id}|${f}`);
                          return (
                            <div key={ei} className="grid grid-cols-1 md:grid-cols-[1.4fr_repeat(4,0.7fr)] gap-2 items-center">
                              <Input
                                value={ov.name ?? ""}
                                onChange={(e) => setOverride(weekIdx, id, { name: e.target.value })}
                                placeholder={`= ${ex.name || "(base)"}`}
                                className="h-7 text-xs"
                              />
                              <Input value={ov.sets ?? ""}    onChange={(e) => setOverride(weekIdx, id, { sets: e.target.value })}    placeholder="séries"   className={cn("h-7 text-xs", ovErr("sets") && "border-destructive")} />
                              <Input value={ov.reps ?? ""}    onChange={(e) => setOverride(weekIdx, id, { reps: e.target.value })}    placeholder="reps"     className={cn("h-7 text-xs", ovErr("reps") && "border-destructive")} />
                              <Input value={ov.cadence ?? ""} onChange={(e) => setOverride(weekIdx, id, { cadence: e.target.value })} placeholder="cadência" className={cn("h-7 text-xs", ovErr("cadence") && "border-destructive")} />
                              <Input value={ov.rest ?? ""}    onChange={(e) => setOverride(weekIdx, id, { rest: e.target.value })}    placeholder="descanso" className={cn("h-7 text-xs", ovErr("rest") && "border-destructive")} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground italic">
                    Deixe em branco para manter o exercício base. Preencha apenas o que muda nesta semana.
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}

      {/* Dialog: salvar template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Salvar template</DialogTitle>
            <DialogDescription className="text-xs">Limite de {MAX_TEMPLATES} templates por coach.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex: Hipertrofia ABC 4 semanas" className="h-9 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Escopo</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button type="button" variant={tplScope === "full" ? "default" : "outline"} size="sm" onClick={() => setTplScope("full")}>
                  Treino + Periodização
                </Button>
                <Button type="button" variant={tplScope === "periodization" ? "default" : "outline"} size="sm" onClick={() => setTplScope("periodization")}>
                  Só Periodização
                </Button>
              </div>
            </div>
            <Button onClick={persistTemplate} disabled={busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookmarkPlus className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: carregar template */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Biblioteca de Treinos</DialogTitle>
            <DialogDescription className="text-xs">Templates do sistema + seus templates salvos. Escolha como aplicar.</DialogDescription>
          </DialogHeader>
          {loadOpen && (
            <TemplateLibrary
              userTemplates={templates}
              onPreview={(tpl) => setPreviewTpl(tpl)}
              onApply={(tpl, mode) => {
                const baseTreinos = tpl.treinos || {};
                const workouts = Array.isArray(baseTreinos.workouts) ? baseTreinos.workouts : [];
                const finalWorkouts = mode === "filled"
                  ? workouts
                  : workouts.map((d: any) => ({ key: d.key, focus: d.focus, exercises: [] }));
                const next = { ...payload };
                if (workouts.length) next.workouts = finalWorkouts as any;
                if (baseTreinos.periodization) next.periodization = baseTreinos.periodization;
                setPayload(next);
                toast.success(mode === "filled" ? "Template aplicado com exercícios" : "Estrutura aplicada — adicione seus exercícios");
                setLoadOpen(false);
              }}
              onHistory={(t) => setHistoryTpl({ id: t.id, name: t.name })}
              onDelete={deleteTemplate}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: preview do template antes de aplicar */}
      <Dialog open={!!previewTpl} onOpenChange={(v) => !v && setPreviewTpl(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewTpl?.name}</DialogTitle>
            <DialogDescription className="text-xs">Revise os treinos antes de aplicar.</DialogDescription>
          </DialogHeader>
          {previewTpl && (
            <div className="space-y-3 py-2">
              {(previewTpl.treinos?.workouts || []).map((d: any) => (
                <div key={d.key} className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs font-bold text-primary mb-2">Treino {d.key} — {d.focus}</p>
                  <ul className="space-y-1">
                    {(d.exercises || []).map((ex: any, i: number) => (
                      <li key={i} className="text-[11px] text-foreground/90 flex items-baseline gap-2">
                        <span className="font-medium">{ex.name}</span>
                        <span className="text-muted-foreground">{ex.sets}×{ex.reps}</span>
                        {ex.rest && <span className="text-muted-foreground">· {ex.rest}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {(() => {
                const ws = checkMuscleRecovery(previewTpl.treinos?.workouts || []);
                return ws.length > 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                    <p className="text-[11px] font-bold text-amber-500 mb-1">⚠ Avisos de recuperação</p>
                    {ws.map((w, i) => <p key={i} className="text-[11px] text-amber-600">{w}</p>)}
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-500">✓ Recuperação muscular adequada entre os dias.</p>
                );
              })()}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={() => {
                  const tpl = previewTpl;
                  setPreviewTpl(null);
                  const baseTreinos = tpl.treinos || {};
                  const workouts = Array.isArray(baseTreinos.workouts) ? baseTreinos.workouts : [];
                  const next = { ...payload };
                  if (workouts.length) next.workouts = workouts as any;
                  if (baseTreinos.periodization) next.periodization = baseTreinos.periodization;
                  setPayload(next);
                  toast.success("Template aplicado com exercícios");
                  setLoadOpen(false);
                }}>▶ Aplicar com exercícios</Button>
                <Button variant="outline" className="flex-1" onClick={() => {
                  const tpl = previewTpl;
                  setPreviewTpl(null);
                  const baseTreinos = tpl.treinos || {};
                  const workouts = Array.isArray(baseTreinos.workouts) ? baseTreinos.workouts : [];
                  const next = { ...payload };
                  if (workouts.length) next.workouts = workouts.map((d: any) => ({ key: d.key, focus: d.focus, exercises: [] })) as any;
                  if (baseTreinos.periodization) next.periodization = baseTreinos.periodization;
                  setPayload(next);
                  toast.success("Estrutura aplicada — adicione seus exercícios");
                  setLoadOpen(false);
                }}>○ Usar estrutura vazia</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

            <WeekPreviewDialog
        open={previewWeek !== null}
        onOpenChange={(v) => !v && setPreviewWeek(null)}
        payload={payload}
        weekIndex={previewWeek}
      />

      <TemplateHistoryDialog
        open={!!historyTpl}
        onOpenChange={(v) => !v && setHistoryTpl(null)}
        templateId={historyTpl?.id ?? null}
        templateName={historyTpl?.name ?? ""}
        onRestore={restoreFromVersion}
      />
      </>
      )}
    </Card>
  );
}

// ─── Subcomponente: Biblioteca de templates (hooks isolados) ───
const DIVISIONS = ["todos", "AB", "ABC", "ABCD", "ABCDE"] as const;
const PROFILES: { value: string; label: string }[] = [
  { value: "todos",                  label: "Todos os perfis" },
  { value: "masculino_geral",        label: "Masculino Geral" },
  { value: "masculino_posterior",    label: "Masculino Posterior" },
  { value: "feminino_gluteo",        label: "Feminino Glúteo" },
  { value: "feminino_musculatura",   label: "Feminino Musculatura" },
];

interface TemplateLibraryProps {
  userTemplates: any[];
  onApply: (tpl: any, mode: "filled" | "empty") => void;
  onHistory: (tpl: any) => void;
  onDelete: (id: string) => void;
  onPreview: (tpl: any) => void;
}

function TemplateLibrary({ userTemplates, onApply, onHistory, onDelete, onPreview }: TemplateLibraryProps) {
  const [filterDiv, setFilterDiv] = useState<string>("todos");
  const [filterProfile, setFilterProfile] = useState<string>("todos");

  const all = [
    ...SYSTEM_TEMPLATES.map((t) => ({ ...t, isSystem: true })),
    ...userTemplates.map((t) => ({ ...t, isSystem: false })),
  ];

  const filtered = all.filter((t: any) => {
    const divMatch = filterDiv === "todos" || t.division === filterDiv;
    const profMatch = filterProfile === "todos" || t.profile === filterProfile;
    return divMatch && profMatch;
  });

  return (
    <div className="max-h-[60vh] overflow-y-auto space-y-3 py-2">
      <div className="flex flex-wrap gap-1.5">
        {DIVISIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilterDiv(d)}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-bold border transition",
              filterDiv === d
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {d === "todos" ? "Todas divisões" : d}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROFILES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setFilterProfile(p.value)}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-bold border transition",
              filterProfile === p.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-6">
          Nenhum template encontrado.
        </p>
      )}

      {/* Lista compacta: seletor + botão de preview */}
      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50">
        {filtered.map((tpl: any, idx: number) => (
          <div
            key={tpl.id}
            className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            {/* Nome + badges numa linha */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{tpl.name}</p>
              <div className="flex gap-1 mt-0.5">
                {tpl.division && (
                  <span className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground font-bold">{tpl.division}</span>
                )}
                {tpl.isSystem ? (
                  <span className="text-[9px] px-1 py-px rounded bg-primary/10 text-primary font-bold">Sistema</span>
                ) : (
                  <span className="text-[9px] px-1 py-px rounded bg-amber-500/10 text-amber-600 font-bold">Seu</span>
                )}
              </div>
            </div>
            {/* Ações compactas */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] px-2"
                title="Visualizar antes de aplicar"
                onClick={() => onPreview(tpl)}
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="default" className="h-7 text-[11px] px-2" onClick={() => onApply(tpl, "filled")}>
                ▶
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => onApply(tpl, "empty")}>
                ○
              </Button>
              {!tpl.isSystem && (
                <>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Histórico" onClick={() => onHistory(tpl)}>
                    <History className="w-3.5 h-3.5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDelete(tpl.id)}
                    className="text-muted-foreground hover:text-destructive p-1.5"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
