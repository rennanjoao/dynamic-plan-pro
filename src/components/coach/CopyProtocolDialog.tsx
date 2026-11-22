/**
 * CopyProtocolDialog.tsx — copiar o protocolo atual (ou um modelo da
 * biblioteca) para UM ou VÁRIOS alunos, como rascunho individual de cada um
 * (auditoria de 21/11/2026, Pacote C: "aplicar um modelo a vários alunos").
 *
 * Regras (src/lib/protocolBulkCopy.ts): aluno com protocolo recebe as seções
 * marcadas no RASCUNHO dele; aluno sem protocolo ganha um protocolo INATIVO.
 * Nada vai para nenhum aluno até o coach abrir, revisar e publicar — o
 * "Abrir o 1º e seguir a fila" leva direto a esse trabalho, um a um.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Search, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCoachStudentsLite } from "@/hooks/useCoachStudents";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import type { CopySection } from "@/lib/protocolCopy";
import { copyToTarget, planBulkCopy, type BulkResult, type BulkTargetPlan } from "@/lib/protocolBulkCopy";

const SECTION_LABELS: Record<CopySection, string> = {
  workout: "Treino", diet: "Dieta", supplements: "Suplementos", guidelines: "Diretrizes",
};

type Step = "select" | "confirm" | "running" | "done";

function resultText(r: BulkResult): string {
  if ("error" in r) return `não copiado: ${r.error}`;
  return r.mode === "draft" ? "rascunho atualizado" : "protocolo inativo criado";
}

export default function CopyProtocolDialog({
  open, onOpenChange, coachId, payload, sourceStudentId, protocolName, sourceLabel, onOpenQueue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachId: string | null;
  payload: ProtocolPayload | null;
  /** Aluno aberto no construtor (fica fora da lista). */
  sourceStudentId?: string;
  protocolName: string;
  /** Quando vem da biblioteca: "Modelo: <nome>". */
  sourceLabel?: string;
  /** Abre o 1º aluno e usa os demais como fila do "Próximo aluno". */
  onOpenQueue?: (studentIds: string[]) => void;
}) {
  const { data: students = [], isLoading } = useCoachStudentsLite(open ? coachId : null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sections, setSections] = useState<Record<CopySection, boolean>>({
    workout: true, diet: true, supplements: true, guidelines: true,
  });
  // Calorias/macros são individuais (peso, objetivo): por padrão NÃO viajam junto com a dieta.
  const [copyMacros, setCopyMacros] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [plans, setPlans] = useState<BulkTargetPlan[]>([]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [busy, setBusy] = useState(false);

  // Reabrir começa do zero.
  useEffect(() => {
    if (!open) return;
    setStep("select"); setSelected([]); setSearch(""); setPlans([]); setResults([]); setBusy(false);
  }, [open]);

  const candidates = useMemo(
    () => students.filter((st) => st.id !== sourceStudentId),
    [students, sourceStudentId],
  );
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return candidates.filter((st) => !s || st.name.toLowerCase().includes(s));
  }, [candidates, search]);
  const nameOf = (id: string) => candidates.find((s) => s.id === id)?.name || "Aluno";
  const pickedSections = (Object.keys(sections) as CopySection[]).filter((k) => sections[k]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.includes(s.id));

  const toggleStudent = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllFiltered = () =>
    setSelected((prev) => (allFilteredSelected
      ? prev.filter((id) => !filtered.some((s) => s.id === id))
      : [...new Set([...prev, ...filtered.map((s) => s.id)])]));

  async function review() {
    if (!payload || selected.length === 0) return;
    if (pickedSections.length === 0) { toast.error("Selecione ao menos uma seção"); return; }
    setBusy(true);
    try {
      setPlans(await planBulkCopy(selected.map((id) => ({ id, name: nameOf(id) }))));
      setStep("confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao verificar os alunos");
    } finally { setBusy(false); }
  }

  async function run() {
    if (!coachId || !payload) return;
    setStep("running");
    const out: BulkResult[] = [];
    for (const plan of plans) {
      // Um de cada vez: cada aluno tem a própria revisão/rascunho.
      out.push(await copyToTarget(plan, { coachId, src: payload as never, sections, copyMacros }));
      setResults([...out]);
    }
    setStep("done");
    const ok = out.filter((r) => r.ok).length;
    if (ok === out.length) toast.success(`${ok} ${ok === 1 ? "rascunho pronto" : "rascunhos prontos"} — nada foi para os alunos ainda`);
    else toast.error(`${out.length - ok} de ${out.length} não foram copiados — veja a lista`);
  }

  const withDraft = plans.filter((p) => p.protocol && p.draftPayload);
  const withProtocol = plans.filter((p) => p.protocol && !p.draftPayload);
  const withoutProtocol = plans.filter((p) => !p.protocol);
  const okIds = results.filter((r) => r.ok).map((r) => r.id);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (step !== "running") onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{sourceLabel ? "Aplicar modelo a alunos" : "Copiar para alunos"}</DialogTitle>
          <DialogDescription className="text-xs">
            {sourceLabel ? <><strong>{sourceLabel}</strong> · </> : null}
            Cada aluno recebe um rascunho próprio para você individualizar. Nada vai para os alunos até você abrir, revisar e publicar.
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <>
            <div className="space-y-3 py-1 flex-1 overflow-y-auto">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">O que copiar</p>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(SECTION_LABELS) as CopySection[]).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={sections[k]} onCheckedChange={() => setSections((p) => ({ ...p, [k]: !p[k] }))} />
                      {SECTION_LABELS[k]}
                    </label>
                  ))}
                </div>
                {sections.diet && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer mt-2">
                    <Checkbox checked={copyMacros} onCheckedChange={() => setCopyMacros((v) => !v)} />
                    Copiar também calorias e macros (por padrão cada aluno mantém os dele)
                  </label>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Alunos ({selected.length} selecionado{selected.length === 1 ? "" : "s"})</p>
                  {filtered.length > 0 && (
                    <button type="button" className="text-[11px] text-primary hover:underline" onClick={toggleAllFiltered}>
                      {allFilteredSelected ? "Limpar" : search ? "Marcar os filtrados" : "Marcar todos"}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar aluno..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 text-sm pl-8" />
                </div>
                <div className="mt-2 border border-border/60 rounded-md max-h-64 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">Nenhum aluno encontrado.</p>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {filtered.map((st) => (
                        <li key={st.id}>
                          <label className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/40 cursor-pointer">
                            <Checkbox checked={selected.includes(st.id)} onCheckedChange={() => toggleStudent(st.id)} aria-label={st.name} />
                            <span className="truncate">{st.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-border/40">
              <Button onClick={review} disabled={selected.length === 0 || !payload || busy} className="w-full" data-testid="bulk-review">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Revisar e copiar para {selected.length || ""} {selected.length === 1 ? "aluno" : "alunos"}
              </Button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="space-y-3 py-1 flex-1 overflow-y-auto text-sm" data-testid="bulk-confirm">
              <p>
                Copiar <strong>{pickedSections.map((k) => SECTION_LABELS[k]).join(", ")}</strong>
                {sections.diet && !copyMacros ? " (sem calorias/macros)" : ""} para <strong>{plans.length}</strong> {plans.length === 1 ? "aluno" : "alunos"}:
              </p>
              {withDraft.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-200">
                  <p className="text-xs font-semibold">Já têm rascunho não publicado — essas seções do rascunho serão substituídas:</p>
                  <p className="text-xs mt-1">{withDraft.map((p) => p.name).join(", ")}</p>
                </div>
              )}
              {withProtocol.length > 0 && (
                <div className="rounded-md border border-border/60 p-2.5">
                  <p className="text-xs font-semibold">Têm protocolo publicado — vira rascunho; o aluno continua vendo o atual:</p>
                  <p className="text-xs text-muted-foreground mt-1">{withProtocol.map((p) => p.name).join(", ")}</p>
                </div>
              )}
              {withoutProtocol.length > 0 && (
                <div className="rounded-md border border-border/60 p-2.5">
                  <p className="text-xs font-semibold">Ainda sem protocolo — será criado um protocolo inativo:</p>
                  <p className="text-xs text-muted-foreground mt-1">{withoutProtocol.map((p) => p.name).join(", ")}</p>
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-border/40 flex gap-2">
              <Button variant="outline" onClick={() => setStep("select")} className="flex-1">Voltar</Button>
              <Button onClick={run} className="flex-1" data-testid="bulk-run">Confirmar</Button>
            </div>
          </>
        )}

        {(step === "running" || step === "done") && (
          <>
            <ul className="space-y-1 py-1 flex-1 overflow-y-auto" data-testid="bulk-results">
              {plans.map((p) => {
                const r = results.find((x) => x.id === p.id);
                return (
                  <li key={p.id} className="flex items-start gap-2 text-sm">
                    {!r ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-muted-foreground shrink-0" />
                      : r.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                      : <XCircle className="w-4 h-4 mt-0.5 text-rose-500 shrink-0" />}
                    <span className="min-w-0">
                      <span className="font-medium">{p.name}</span>
                      {r && (
                        <span className="text-xs text-muted-foreground">
                          {" — "}{resultText(r)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {step === "done" && (
              <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Fechar</Button>
                {onOpenQueue && okIds.length > 0 && (
                  <Button onClick={() => { onOpenChange(false); onOpenQueue(okIds); }} className="flex-1" data-testid="bulk-open-queue">
                    Abrir o 1º e seguir a fila ({okIds.length})
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
