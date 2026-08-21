/**
 * PrescriptionProfileSection.tsx — "Perfil de Prescrição" do aluno (coach).
 *
 * Estado atual (sem versionamento): um único row por aluno em
 * `prescription_profile`, sobrescrito a cada salvamento. Não substitui a
 * anamnese — guarda só prioridade por grupo muscular, dominância, limitações
 * e observação visual, com a origem (source) escolhida pelo coach.
 * O aluno não lê esta tabela (decisão de produto, garantida por RLS).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PrescriptionProfileHistoryDialog from "@/components/coach/PrescriptionProfileHistoryDialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MUSCLE_GROUP_LABELS, MUSCLE_GROUP_OPTIONS, type MuscleGroup,
} from "@/lib/muscleGroupClassifier";
import {
  DOMINANCES, DOMINANCE_LABELS, PRIORITY_LEVELS, PRIORITY_LEVEL_LABELS,
  PrescriptionProfileSchema, SOURCES, SOURCE_LABELS,
  type Dominance, type PriorityLevel, type SourceKind,
} from "@/lib/prescriptionProfileSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const NONE = "__none__";

function SourcePicker({
  value, onChange,
}: { value: SourceKind | undefined; onChange: (v: SourceKind | undefined) => void }) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? undefined : (v as SourceKind))}
    >
      <SelectTrigger className="h-8 w-[190px] text-xs">
        <SelectValue placeholder="Origem…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Origem não informada</SelectItem>
        {SOURCES.map((s) => (
          <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function PrescriptionProfileSection({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<Partial<Record<MuscleGroup, PriorityLevel>>>({});
  const [dominances, setDominances] = useState<Dominance[]>([]);
  const [limitations, setLimitations] = useState("");
  const [visual, setVisual] = useState("");
  const [sources, setSources] = useState<Record<string, SourceKind>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    setCoachId(auth.user?.id ?? null);

    const { data, error } = await sb
      .from("prescription_profile")
      .select("muscle_priorities, dominances, limitations, visual_observations, sources")
      .eq("student_id", studentId)
      .maybeSingle();

    if (error) {
      toast.error(`Falha ao carregar perfil de prescrição: ${error.message}`);
    } else if (data) {
      setPriorities((data.muscle_priorities ?? {}) as Partial<Record<MuscleGroup, PriorityLevel>>);
      setDominances((data.dominances ?? []) as Dominance[]);
      setLimitations(data.limitations ?? "");
      setVisual(data.visual_observations ?? "");
      setSources((data.sources ?? {}) as Record<string, SourceKind>);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const setSource = (field: string, v: SourceKind | undefined) => {
    setSources((prev) => {
      const next = { ...prev };
      if (v) next[field] = v; else delete next[field];
      return next;
    });
  };

  const toggleDominance = (d: Dominance) => {
    setDominances((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const save = async () => {
    if (!coachId) { toast.error("Coach não identificado."); return; }
    const cleanPriorities = Object.fromEntries(
      Object.entries(priorities).filter(([, v]) => !!v),
    );
    const parsed = PrescriptionProfileSchema.safeParse({
      student_id: studentId,
      coach_id: coachId,
      muscle_priorities: cleanPriorities,
      dominances,
      limitations: limitations.trim() || null,
      visual_observations: visual.trim() || null,
      sources,
    });
    if (!parsed.success) {
      toast.error("Dados inválidos no perfil de prescrição.");
      return;
    }

    setSaving(true);
    const { error } = await sb
      .from("prescription_profile")
      .upsert({ ...parsed.data, updated_by: coachId }, { onConflict: "student_id" });
    setSaving(false);

    if (error) toast.error(`Falha ao salvar: ${error.message}`);
    else toast.success("Perfil de prescrição salvo.");
  };

  return (
    <Card className="border-border/60">
      <CardContent className="pt-4">
        <Accordion type="single" collapsible>
          <AccordionItem value="perfil" className="border-none">
            <AccordionTrigger className="py-1 text-sm font-semibold">
              Perfil de Prescrição
            </AccordionTrigger>
            <AccordionContent>
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
              ) : (
                <div className="space-y-5 pt-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Anotações do coach sobre o aluno. O aluno não vê esta ficha.
                      O objetivo geral continua na Anamnese.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => setHistoryOpen(true)}
                    >
                      <History className="w-3 h-3 mr-1" /> Histórico
                    </Button>
                  </div>

                  {/* Prioridades */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Prioridade por grupo muscular
                      </label>
                      <SourcePicker
                        value={sources.muscle_priorities}
                        onChange={(v) => setSource("muscle_priorities", v)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {MUSCLE_GROUP_OPTIONS.map((g) => (
                        <div key={g} className="flex items-center justify-between gap-2">
                          <span className="text-xs">{MUSCLE_GROUP_LABELS[g]}</span>
                          <Select
                            value={priorities[g] ?? NONE}
                            onValueChange={(v) =>
                              setPriorities((prev) => {
                                const next = { ...prev };
                                if (v === NONE) delete next[g];
                                else next[g] = v as PriorityLevel;
                                return next;
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[190px] text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>—</SelectItem>
                              {PRIORITY_LEVELS.map((p) => (
                                <SelectItem key={p} value={p}>{PRIORITY_LEVEL_LABELS[p]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dominâncias */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">Dominâncias</label>
                      <SourcePicker
                        value={sources.dominances}
                        onChange={(v) => setSource("dominances", v)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DOMINANCES.map((d) => {
                        const on = dominances.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDominance(d)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:border-primary/60"
                            }`}
                          >
                            {DOMINANCE_LABELS[d]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Limitações */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">Limitações</label>
                      <SourcePicker
                        value={sources.limitations}
                        onChange={(v) => setSource("limitations", v)}
                      />
                    </div>
                    <Textarea
                      value={limitations}
                      onChange={(e) => setLimitations(e.target.value)}
                      rows={3}
                      placeholder="Restrições articulares, dores, contraindicações relatadas…"
                    />
                  </div>

                  {/* Observação visual */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Observação visual (indício, não diagnóstico)
                      </label>
                      <SourcePicker
                        value={sources.visual_observations}
                        onChange={(v) => setSource("visual_observations", v)}
                      />
                    </div>
                    <Textarea
                      value={visual}
                      onChange={(e) => setVisual(e.target.value)}
                      rows={3}
                      placeholder="O que as fotos sugerem — indício para investigar, nunca conclusão."
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                      Salvar perfil
                    </Button>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
      <PrescriptionProfileHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        studentId={studentId}
      />
    </Card>
  );
}
