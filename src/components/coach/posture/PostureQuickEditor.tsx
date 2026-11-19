/**
 * Postura rápida — marcação de desvios comuns em poucos toques, sobre as
 * fotos de um check-in (ou da anamnese, como ponto de partida).
 *
 * Fluxo: o coach vê a foto, toca no desvio (a foto troca sozinha para a pose
 * certa) e escolhe Ok / Observar / Investigar. Tocar de novo no mesmo grau
 * apaga a marcação (volta a "não avaliado"). Ao marcar Observar/Investigar,
 * aparece o raciocínio do manual: primeiro teste, o que favorecer, o que evitar.
 *
 * Em check-ins, a IA pode sugerir uma leitura (hipótese visual). A sugestão só
 * preenche o que o coach ainda não marcou e só vale depois de "Salvar".
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Sparkles, AlertTriangle, FlaskConical, ThumbsUp, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PrivateImg } from "@/components/coach/PrivacyMode";
import { cn } from "@/lib/utils";
import {
  GRADE_META, GRADE_ORDER, POSTURE_DEVIATIONS, POSTURE_DISCLAIMER, POSTURE_RED_FLAGS, applyAiSuggestion,
  type PoseKey, type PostureFindings, type PostureGrade, type PostureQuickCheck,
} from "@/lib/postureQuick";
import { usePostureAiSuggestion, useRequestPostureAi, useSavePostureQuickCheck } from "@/hooks/usePostureQuickChecks";

const POSES: { key: PoseKey; label: string }[] = [
  { key: "frente", label: "Frente" },
  { key: "lateral_dir", label: "Lado D" },
  { key: "lateral_esq", label: "Lado E" },
  { key: "costas", label: "Costas" },
];

export interface PostureSource {
  kind: "anamnesis" | "checkin";
  id: string;
  date: string;
  photos: Record<string, string>;
}

interface Props {
  studentId: string;
  source: PostureSource;
  existing: PostureQuickCheck | null;
  onSaved?: () => void;
}

export default function PostureQuickEditor({ studentId, source, existing, onSaved }: Props) {
  const [findings, setFindings] = useState<PostureFindings>(existing?.findings ?? {});
  const [note, setNote] = useState(existing?.note ?? "");
  const availablePoses = useMemo(() => POSES.filter((p) => !!source.photos[p.key]), [source.photos]);
  const [pose, setPose] = useState<PoseKey>(availablePoses[0]?.key ?? "frente");
  const save = useSavePostureQuickCheck();

  const isCheckin = source.kind === "checkin";
  const aiQ = usePostureAiSuggestion(isCheckin ? source.id : null);
  const requestAi = useRequestPostureAi();
  const ai = aiQ.data?.suggestion ?? null;
  const hasAllPhotos = POSES.every((p) => !!source.photos[p.key]);

  // Trocou de check-in: recarrega o que já estava marcado nele.
  useEffect(() => {
    setFindings(existing?.findings ?? {});
    setNote(existing?.note ?? "");
  }, [existing, source.id]);
  const firstPose = availablePoses[0]?.key ?? "frente";
  useEffect(() => {
    setPose(firstPose);
  }, [source.id, firstPose]);

  const dirty = useMemo(() => {
    const a = JSON.stringify(existing?.findings ?? {});
    const b = JSON.stringify(findings);
    return a !== b || (existing?.note ?? "") !== note;
  }, [existing, findings, note]);

  const setGrade = (key: string, grade: PostureGrade) => {
    setFindings((prev) => {
      const next = { ...prev };
      if (next[key] === grade) delete next[key];
      else next[key] = grade;
      return next;
    });
  };

  const focusDeviation = (poses: PoseKey[]) => {
    const target = poses.find((p) => source.photos[p]);
    if (target) setPose(target);
  };

  const pendingFromAi = ai ? Object.keys(ai.items).filter((k) => findings[k] === undefined).length : 0;

  const handleUseAi = () => {
    if (!ai) return;
    setFindings((prev) => applyAiSuggestion(prev, ai));
    toast.message("Sugestões aplicadas onde você ainda não tinha marcado. Confira e salve.");
  };

  const handleRequestAi = async () => {
    try {
      await requestAi.mutateAsync(source.id);
      toast.success("Sugestão da IA pronta.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a sugestão.");
    }
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        studentId,
        sourceKind: source.kind,
        sourceId: source.id,
        sourceDate: source.date,
        findings,
        note,
      });
      toast.success("Postura salva.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a postura.");
    }
  };

  const activePose = availablePoses.find((p) => p.key === pose) ?? availablePoses[0];
  const marked = Object.keys(findings).length;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]" data-testid="posture-quick-editor">
      <div className="space-y-2">
        {availablePoses.length === 0 ? (
          <div className="aspect-[3/4] rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            Sem fotos neste envio. Dá para marcar mesmo assim, se você avaliou de outra forma.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {availablePoses.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPose(p.key)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    p.key === activePose?.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {activePose && (
              <div className="aspect-[3/4] max-h-[50vh] mx-auto rounded-md overflow-hidden border border-border/50 bg-muted/30">
                <PrivateImg
                  src={source.photos[activePose.key]}
                  alt={`Foto ${activePose.label}`}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground" data-testid="posture-disclaimer">
          <strong className="text-foreground">{POSTURE_DISCLAIMER}</strong>{" "}
          Toque no grau que você enxergar; tocar de novo apaga. Sem marcar = não avaliado.
        </p>

        {isCheckin && !aiQ.data?.unavailable && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-1.5" data-testid="posture-ai-panel">
            {aiQ.isLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando sugestão da IA…</p>
            ) : ai ? (
              <>
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Sugestão da IA (hipótese visual)
                  {ai.reliability != null && (
                    <span className="font-normal text-muted-foreground">· confiança {Math.round(ai.reliability * 100)}%</span>
                  )}
                </p>
                {ai.photoIssues.length > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">Atenção à foto: {ai.photoIssues.join(" · ")}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8" onClick={handleUseAi} disabled={pendingFromAi === 0} data-testid="posture-use-ai">
                    {pendingFromAi === 0 ? "Sugestões já conferidas" : `Usar sugestões da IA (${pendingFromAi})`}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Preenche só o que você não marcou. Confira na foto antes de salvar.</span>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={handleRequestAi}
                  disabled={!hasAllPhotos || requestAi.isPending}
                  data-testid="posture-request-ai"
                >
                  {requestAi.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Pedir sugestão da IA
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {hasAllPhotos ? "A IA olha as 4 fotos e sugere; você decide." : "Precisa das 4 fotos (frente, dois lados e costas)."}
                </span>
              </div>
            )}
          </div>
        )}

        <ul className="divide-y divide-border rounded-lg border border-border">
          {POSTURE_DEVIATIONS.map((d) => {
            const g = findings[d.key];
            const aiItem = ai?.items[d.key];
            const aiNotVisible = ai?.notVisible.includes(d.key);
            return (
              <li key={d.key} className="px-3 py-2 space-y-1.5" data-testid={`posture-row-${d.key}`}>
                <button type="button" onClick={() => focusDeviation(d.poses)} className="w-full text-left">
                  <span className="text-sm font-medium text-foreground">{d.label}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{d.look}</span>
                </button>
                {aiItem && (
                  <p className="text-[11px] text-muted-foreground leading-snug" data-testid={`posture-ai-${d.key}`}>
                    <span className={cn("inline-block mr-1.5 px-1.5 py-px rounded border font-semibold", GRADE_META[aiItem.grade].cls)}>
                      IA: {GRADE_META[aiItem.grade].label}
                    </span>
                    {aiItem.description}
                  </p>
                )}
                {aiNotVisible && (
                  <p className="text-[11px] text-muted-foreground italic">IA: não deu para ver nesta foto.</p>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {GRADE_ORDER.map((grade) => {
                    const active = g === grade;
                    return (
                      <button
                        key={grade}
                        type="button"
                        aria-pressed={active}
                        onClick={() => { setGrade(d.key, grade); focusDeviation(d.poses); }}
                        className={cn(
                          "h-9 rounded-md border text-xs font-semibold transition-colors",
                          active ? GRADE_META[grade].cls : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {GRADE_META[grade].label}
                      </button>
                    );
                  })}
                </div>
                {(g === "mild" || g === "marked") && (
                  <div className="rounded-md bg-muted/40 px-2.5 py-2 space-y-1 text-[11px] leading-snug" data-testid={`posture-guide-${d.key}`}>
                    <p><FlaskConical className="inline w-3 h-3 mr-1 text-primary" /><strong>Primeiro teste:</strong> {d.guidance.test}</p>
                    <p><ThumbsUp className="inline w-3 h-3 mr-1 text-emerald-600" /><strong>Se confirmar, favoreça:</strong> {d.guidance.favor}</p>
                    <p><Ban className="inline w-3 h-3 mr-1 text-red-600" /><strong>Evite:</strong> {d.guidance.avoid}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <details className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px]" data-testid="posture-red-flags">
          <summary className="cursor-pointer font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Quando encaminhar (fisioterapeuta ou médico)
          </summary>
          <ul className="mt-1.5 space-y-0.5 list-disc pl-4 text-muted-foreground">
            {POSTURE_RED_FLAGS.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <p className="mt-1.5 text-muted-foreground">Com qualquer um desses sinais, pare de insistir na correção e encaminhe.</p>
        </details>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Observação (opcional) — ex.: ombro D mais baixo; testar apoio em uma perna no próximo treino"
          className="text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{marked} de {POSTURE_DEVIATIONS.length} avaliados</span>
          <Button size="sm" onClick={handleSave} disabled={save.isPending || !dirty} data-testid="posture-save">
            {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Salvar postura
          </Button>
        </div>
      </div>
    </div>
  );
}
