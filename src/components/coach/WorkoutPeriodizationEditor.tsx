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
import { cn } from "@/lib/utils";

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
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplScope, setTplScope] = useState<"full" | "periodization">("full");
  const [loadOpen, setLoadOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewWeek, setPreviewWeek] = useState<number | null>(null);
  const [historyTpl, setHistoryTpl] = useState<{ id: string; name: string } | null>(null);
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

  function resetAllToDefault() {
    if (!confirm("Resetar todas as 4 semanas e overrides para o padrão?")) return;
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
    if (!confirm("Excluir este template?")) return;
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
            <DialogTitle>Templates salvos</DialogTitle>
            <DialogDescription className="text-xs">Aplicar substitui treino e/ou periodização atuais.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-6">Nenhum template salvo.</p>
            )}
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 border border-border rounded-lg p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">{t.description || t.level}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyTemplate(t)}>Aplicar</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" title="Histórico" onClick={() => setHistoryTpl({ id: t.id, name: t.name })}>
                  <History className="w-3.5 h-3.5" />
                </Button>
                <button onClick={() => deleteTemplate(t.id)} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
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
    </Card>
  );
}