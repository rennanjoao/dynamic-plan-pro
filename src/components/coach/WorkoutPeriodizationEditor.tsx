import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar, BookmarkPlus, Library, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ProtocolPayload } from "@/lib/protocolSchema";

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
        ? { workouts: payload.workouts, periodization: payload.periodization, scope: "full" }
        : { periodization: payload.periodization, scope: "periodization" };
      const { error } = await sb.from("workout_templates").insert({
        created_by: coachId,
        name: tplName.trim(),
        level: tplScope,
        description: tplScope === "full" ? "Treino + Periodização" : "Periodização",
        treinos,
      });
      if (error) throw error;
      toast.success("Template salvo");
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

  return (
    <Card className="bg-card/60 border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Periodização (4 semanas)</Label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Editor de metadados das 4 semanas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {p.weeks.map((w, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                <Input
                  value={w.label}
                  onChange={(e) => updateWeek(i, "label", e.target.value)}
                  className="h-8 text-xs font-bold"
                  placeholder={`Semana ${i + 1}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Séries</Label>
                    <Input value={w.sets} onChange={(e) => updateWeek(i, "sets", e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Reps</Label>
                    <Input value={w.reps} onChange={(e) => updateWeek(i, "reps", e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Descanso</Label>
                    <Input value={w.rest} onChange={(e) => updateWeek(i, "rest", e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Cadência</Label>
                    <Input value={w.cadence} onChange={(e) => updateWeek(i, "cadence", e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
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
                          return (
                            <div key={ei} className="grid grid-cols-1 md:grid-cols-[1.4fr_repeat(4,0.7fr)] gap-2 items-center">
                              <Input
                                value={ov.name ?? ""}
                                onChange={(e) => setOverride(weekIdx, id, { name: e.target.value })}
                                placeholder={`= ${ex.name || "(base)"}`}
                                className="h-7 text-xs"
                              />
                              <Input value={ov.sets ?? ""}    onChange={(e) => setOverride(weekIdx, id, { sets: e.target.value })}    placeholder="séries" className="h-7 text-xs" />
                              <Input value={ov.reps ?? ""}    onChange={(e) => setOverride(weekIdx, id, { reps: e.target.value })}    placeholder="reps"   className="h-7 text-xs" />
                              <Input value={ov.cadence ?? ""} onChange={(e) => setOverride(weekIdx, id, { cadence: e.target.value })} placeholder="cadência" className="h-7 text-xs" />
                              <Input value={ov.rest ?? ""}    onChange={(e) => setOverride(weekIdx, id, { rest: e.target.value })}    placeholder="descanso" className="h-7 text-xs" />
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
                <button onClick={() => deleteTemplate(t.id)} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}