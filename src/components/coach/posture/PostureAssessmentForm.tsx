import { useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  emptyPostureForm,
  hasRedFlag,
  POSTURE_SUGGESTION_RULES,
  suggestionFor,
  validatePostureForm,
} from "@/lib/postureSuggestionRules";
import { useSavePostureAssessment } from "@/hooks/usePostureAssessments";
import {
  FUNCTIONAL_TESTS,
  PROGRESSION_LEVELS,
  RED_FLAG_LABELS,
  VIEW_LABELS,
  type CompensationId,
  type PostureAssessmentFormValues,
  type ProgressionLevel,
  type RedFlagKey,
  type Side,
  type ViewAngle,
} from "@/types/postureAssessment";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PainPicker({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      <button type="button" onClick={() => onChange(null)}
        className={`h-8 rounded-md border px-2 text-xs ${value === null ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
        Não avaliado
      </button>
      {Array.from({ length: 11 }, (_, n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`Dor ${n}`}
          onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-md border text-xs ${value === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function PostureAssessmentForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const [v, setV] = useState<PostureAssessmentFormValues>(() => emptyPostureForm());
  const [photos, setPhotos] = useState<Partial<Record<ViewAngle, File>>>({});
  const save = useSavePostureAssessment(studentId);
  const flagged = hasRedFlag(v.redFlags);
  const suggestion = suggestionFor(v.decision.compensation, v.redFlags);

  const set = <K extends keyof PostureAssessmentFormValues>(k: K, val: PostureAssessmentFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const toggleFlag = (k: RedFlagKey, on: boolean) =>
    setV((p) => {
      const redFlags = { ...p.redFlags, [k]: on };
      const any = Object.values(redFlags).some(Boolean);
      return {
        ...p,
        redFlags,
        referralRecommended: any ? true : p.referralRecommended,
        functionalTests: any ? p.functionalTests.map((t) => ({ ...t, completed: false })) : p.functionalTests,
      };
    });

  const updateTest = (i: number, patch: Partial<PostureAssessmentFormValues["functionalTests"][number]>) =>
    setV((p) => ({ ...p, functionalTests: p.functionalTests.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));

  const applySuggestion = () => {
    if (!suggestion) return;
    setV((p) => ({
      ...p,
      decision: {
        ...p.decision,
        dominantStrategyHypothesis: suggestion.hypothesis,
        muscleGroupToFavor: suggestion.muscleGroupToFavor,
        chosenRegression: suggestion.regression,
        suggestedStrategies: [...suggestion.strategies],
      },
    }));
  };

  const submit = async () => {
    const errors = validatePostureForm(v);
    if (errors.length) { toast.error(errors[0]); return; }
    try {
      await save.mutateAsync({ values: v, photos });
      toast.success("Avaliação registrada.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a avaliação.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Registro educacional de observação para o treino. Não é diagnóstico e não substitui fisioterapeuta ou médico.
      </p>

      <Section title="1. Triagem">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data da avaliação">
            <Input type="date" value={v.assessedAt} onChange={(e) => set("assessedAt", e.target.value)} />
          </Field>
          <Field label="Queixa principal">
            <Input value={v.complaint} onChange={(e) => set("complaint", e.target.value)} />
          </Field>
        </div>
        <Field label="Dor (0–10)">
          <PainPicker label="Dor de 0 a 10" value={v.painScore} onChange={(n) => set("painScore", n)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Local da dor"><Input value={v.painLocation} onChange={(e) => set("painLocation", e.target.value)} /></Field>
          <Field label="Sensação predominante (lombar, glúteo, posterior…)"><Input value={v.muscleSensation} onChange={(e) => set("muscleSensation", e.target.value)} /></Field>
          <Field label="O que piora"><Input value={v.painWorseWith} onChange={(e) => set("painWorseWith", e.target.value)} /></Field>
          <Field label="O que melhora"><Input value={v.painBetterWith} onChange={(e) => set("painBetterWith", e.target.value)} /></Field>
        </div>
        <Field label="Histórico relevante (cirurgia, gestação recente, lesão)">
          <Textarea rows={2} value={v.relevantHistory} onChange={(e) => set("relevantHistory", e.target.value)} />
        </Field>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Sinais de alerta</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(RED_FLAG_LABELS) as RedFlagKey[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={v.redFlags[k]} onCheckedChange={(c) => toggleFlag(k, c === true)} />
                {RED_FLAG_LABELS[k]}
              </label>
            ))}
          </div>
        </div>
        {flagged && (
          <div role="alert" className="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>Sinal de alerta marcado. Os testes funcionais ficam bloqueados e o encaminhamento a um profissional de saúde é recomendado. Isto não é um diagnóstico.</p>
              <label className="flex items-center gap-2">
                <Checkbox checked={v.referralRecommended} onCheckedChange={(c) => set("referralRecommended", c === true)} />
                Encaminhamento recomendado registrado
              </label>
            </div>
          </div>
        )}
      </Section>

      <Section title="2. Observação estática">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pelve">
            <select className={selectCls} value={v.staticObservations.pelvicTilt}
              onChange={(e) => set("staticObservations", { ...v.staticObservations, pelvicTilt: e.target.value as never })}>
              <option value="not_assessed">Não avaliado</option>
              <option value="anterior">Anteversão aparente</option>
              <option value="posterior">Retroversão aparente</option>
              <option value="neutral_or_variable">Neutra / variável</option>
            </select>
          </Field>
          <Field label="Curva lombar">
            <select className={selectCls} value={v.staticObservations.lumbarCurve}
              onChange={(e) => set("staticObservations", { ...v.staticObservations, lumbarCurve: e.target.value as never })}>
              <option value="not_assessed">Não avaliado</option>
              <option value="increased">Aumentada</option>
              <option value="reduced">Reduzida</option>
              <option value="not_obvious">Sem alteração evidente</option>
            </select>
          </Field>
          {([
            ["ribPelvisRelationship", "Costelas–pelve"],
            ["kneePosition", "Joelhos"],
            ["footSupport", "Apoio dos pés"],
            ["weightDistribution", "Distribuição de peso"],
            ["asymmetries", "Assimetrias"],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input value={v.staticObservations[k] ?? ""} onChange={(e) => set("staticObservations", { ...v.staticObservations, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {([["frontNotes", "Frente"], ["sideNotes", "Lado"], ["backNotes", "Costas"]] as const).map(([k, label]) => (
            <Field key={k} label={`Notas — ${label}`}>
              <Textarea rows={2} value={v.staticObservations[k] ?? ""} onChange={(e) => set("staticObservations", { ...v.staticObservations, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="3. Testes funcionais">
        {flagged ? (
          <p className="text-sm text-muted-foreground">Bloqueado por sinal de alerta.</p>
        ) : (
          <div className="space-y-3">
            {v.functionalTests.map((t, i) => {
              const meta = FUNCTIONAL_TESTS.find((f) => f.id === t.test);
              return (
                <div key={t.test} className="space-y-2 rounded-md border border-border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox checked={t.completed} onCheckedChange={(c) => updateTest(i, { completed: c === true })} />
                    {t.label}
                  </label>
                  <p className="text-xs text-muted-foreground">{meta?.hint} Interrompa se houver dor ou piora.</p>
                  {t.completed && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Lado">
                        <select className={selectCls} value={t.side} onChange={(e) => updateTest(i, { side: e.target.value as Side })}>
                          <option value="not_applicable">Não se aplica</option>
                          <option value="left">Esquerdo</option>
                          <option value="right">Direito</option>
                          <option value="bilateral">Bilateral</option>
                        </select>
                      </Field>
                      <Field label="Resultado"><Input value={t.result} onChange={(e) => updateTest(i, { result: e.target.value })} /></Field>
                      <div className="sm:col-span-2">
                        <Field label="Observações"><Textarea rows={2} value={t.observations} onChange={(e) => updateTest(i, { observations: e.target.value })} /></Field>
                      </div>
                      {t.test === "post_intervention_response" && (
                        <>
                          <Field label="Antes"><Input value={t.beforeIntervention ?? ""} onChange={(e) => updateTest(i, { beforeIntervention: e.target.value })} /></Field>
                          <Field label="Depois"><Input value={t.afterIntervention ?? ""} onChange={(e) => updateTest(i, { afterIntervention: e.target.value })} /></Field>
                        </>
                      )}
                      <div className="sm:col-span-2">
                        <Field label="Dor no teste">
                          <PainPicker label={`Dor em ${t.label}`} value={t.painScore} onChange={(n) => updateTest(i, { painScore: n })} />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="4. Síntese e decisão">
        <Field label="Compensação observada">
          <select className={selectCls} value={v.decision.compensation ?? ""}
            onChange={(e) => set("decision", { ...v.decision, compensation: (e.target.value || null) as CompensationId | null })}>
            <option value="">Nenhuma selecionada</option>
            {(Object.keys(POSTURE_SUGGESTION_RULES) as CompensationId[]).map((k) => (
              <option key={k} value={k}>{POSTURE_SUGGESTION_RULES[k].label}</option>
            ))}
          </select>
        </Field>
        {suggestion && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <p className="flex items-center gap-1 text-xs font-semibold text-primary"><Sparkles className="h-3 w-3" /> Sugestão — confirmar/editar pelo Coach</p>
            <p>{suggestion.hypothesis}</p>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">{suggestion.strategies.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="text-xs text-muted-foreground">Cuidado: {suggestion.caution}</p>
            <Button type="button" size="sm" variant="outline" onClick={applySuggestion}>Usar sugestão nos campos</Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hipótese de estratégia dominante"><Textarea rows={2} value={v.decision.dominantStrategyHypothesis} onChange={(e) => set("decision", { ...v.decision, dominantStrategyHypothesis: e.target.value })} /></Field>
          <Field label="Grupo a favorecer"><Textarea rows={2} value={v.decision.muscleGroupToFavor} onChange={(e) => set("decision", { ...v.decision, muscleGroupToFavor: e.target.value })} /></Field>
        </div>
        <Field label="Regressão / conduta escolhida"><Textarea rows={2} value={v.decision.chosenRegression} onChange={(e) => set("decision", { ...v.decision, chosenRegression: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={v.decision.coachConfirmed} onCheckedChange={(c) => set("decision", { ...v.decision, coachConfirmed: c === true })} />
          Coach revisou e confirma a decisão
        </label>
      </Section>

      <Section title="5. Intervenção e progressão">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Intervenção aplicada"><Textarea rows={2} value={v.intervention} onChange={(e) => set("intervention", e.target.value)} /></Field>
          <Field label="Resposta após intervenção"><Textarea rows={2} value={v.postInterventionResponse} onChange={(e) => set("postInterventionResponse", e.target.value)} /></Field>
          <Field label="Nível de progressão">
            <select className={selectCls} value={v.progressionLevel ?? ""}
              onChange={(e) => set("progressionLevel", e.target.value ? (Number(e.target.value) as ProgressionLevel) : null)}>
              <option value="">Não definido</option>
              {PROGRESSION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.value} — {l.label}</option>)}
            </select>
          </Field>
          <Field label="Critério para progredir"><Input value={v.progressionCriterion} onChange={(e) => set("progressionCriterion", e.target.value)} /></Field>
        </div>
        <Field label="Observações gerais"><Textarea rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </Section>

      <Section title="6. Fotos (opcional)">
        <p className="text-xs text-muted-foreground">Fotos ficam privadas, visíveis só para o aluno e coach vinculado. Confirme o consentimento do aluno.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(VIEW_LABELS) as ViewAngle[]).map((view) => (
            <Field key={view} label={VIEW_LABELS[view]}>
              <Input type="file" accept="image/*" aria-label={`Foto ${VIEW_LABELS[view]}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPhotos((p) => { const n = { ...p }; if (f) n[view] = f; else delete n[view]; return n; });
                }} />
              {photos[view] && <img src={URL.createObjectURL(photos[view] as File)} alt={`Prévia ${VIEW_LABELS[view]}`} className="mt-1 h-28 w-full rounded object-cover" />}
            </Field>
          ))}
        </div>
      </Section>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={save.isPending}>Cancelar</Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar avaliação
        </Button>
      </div>
    </div>
  );
}
