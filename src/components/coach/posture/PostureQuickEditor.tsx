/**
 * Postura rápida — marcação de desvios comuns em poucos toques, sobre as
 * fotos de um check-in (ou da anamnese, como ponto de partida).
 *
 * Fluxo: o coach vê a foto, toca no desvio (a foto troca sozinha para a pose
 * certa) e escolhe Não tem / Leve / Acentuado. Tocar de novo no mesmo grau
 * apaga a marcação (volta a "não avaliado").
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PrivateImg } from "@/components/coach/PrivacyMode";
import { cn } from "@/lib/utils";
import {
  GRADE_META, GRADE_ORDER, POSTURE_DEVIATIONS,
  type PoseKey, type PostureFindings, type PostureGrade, type PostureQuickCheck,
} from "@/lib/postureQuick";
import { useSavePostureQuickCheck } from "@/hooks/usePostureQuickChecks";

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
        <p className="text-[11px] text-muted-foreground">
          Toque no grau de cada desvio que você enxergar. Tocar de novo apaga. O que ficar sem marcar conta como "não avaliado".
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {POSTURE_DEVIATIONS.map((d) => (
            <li key={d.key} className="px-3 py-2 space-y-1.5" data-testid={`posture-row-${d.key}`}>
              <button
                type="button"
                onClick={() => focusDeviation(d.poses)}
                className="w-full text-left"
              >
                <span className="text-sm font-medium text-foreground">{d.label}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{d.look}</span>
              </button>
              <div className="grid grid-cols-3 gap-1.5">
                {GRADE_ORDER.map((g) => {
                  const active = findings[d.key] === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setGrade(d.key, g); focusDeviation(d.poses); }}
                      className={cn(
                        "h-9 rounded-md border text-xs font-semibold transition-colors",
                        active ? GRADE_META[g].cls : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {GRADE_META[g].label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Observação (opcional) — ex.: ombro D mais baixo, conferir no próximo check-in"
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
