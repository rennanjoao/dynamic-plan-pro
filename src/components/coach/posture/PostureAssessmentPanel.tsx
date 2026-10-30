import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  signedPhotoUrl,
  useDeletePostureAssessment,
  usePostureAssessments,
  type PostureAssessment,
} from "@/hooks/usePostureAssessments";
import { hasRedFlag, POSTURE_SUGGESTION_RULES } from "@/lib/postureSuggestionRules";
import { PROGRESSION_LEVELS, VIEW_LABELS, type ViewAngle } from "@/types/postureAssessment";
import { PostureAssessmentForm } from "./PostureAssessmentForm";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const levelLabel = (n: number | null) =>
  n ? `${n} — ${PROGRESSION_LEVELS.find((l) => l.value === n)?.label ?? ""}` : "Sem dado";
const txt = (s: string | null | undefined) => (s && s.trim() ? s : "Sem dado");

function SignedPhoto({ path, label }: { path: string | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    signedPhotoUrl(path).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [path]);
  if (!path) return <div className="flex h-36 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">Sem foto ({label})</div>;
  if (!url) return <Skeleton className="h-36 w-full" />;
  return <img src={url} alt={label} className="h-36 w-full rounded object-cover" />;
}

function Column({ a }: { a: PostureAssessment }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="text-sm font-semibold">{fmtDate(a.assessed_at)}</p>
      <div className="grid grid-cols-3 gap-1">
        {(Object.keys(VIEW_LABELS) as ViewAngle[]).map((v) => (
          <SignedPhoto key={v} path={a.photo_paths?.[v] ?? null} label={VIEW_LABELS[v]} />
        ))}
      </div>
      <p><span className="text-muted-foreground">Dor:</span> {a.pain_score ?? "Sem dado"} {a.pain_location ? `· ${a.pain_location}` : ""}</p>
      <p><span className="text-muted-foreground">Nível:</span> {levelLabel(a.progression_level)}</p>
      <p><span className="text-muted-foreground">Compensação:</span> {a.decision?.compensation ? POSTURE_SUGGESTION_RULES[a.decision.compensation]?.label : "Sem dado"}</p>
      <p><span className="text-muted-foreground">Pelve / lombar:</span> {txt(a.static_observations?.pelvicTilt)} / {txt(a.static_observations?.lumbarCurve)}</p>
      <div className="space-y-1">
        {(a.functional_tests ?? []).map((t) => (
          <p key={t.test}><span className="text-muted-foreground">{t.label}:</span> {t.completed ? txt(t.result || t.observations) : "Não avaliado"}</p>
        ))}
      </div>
    </div>
  );
}

export default function PostureAssessmentPanel({ studentId }: { studentId: string }) {
  const { data, isLoading, error, refetch } = usePostureAssessments(studentId);
  const del = useDeletePostureAssessment(studentId);
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => data ?? [], [data]);
  const [refId, setRefId] = useState<string>("");
  const [curId, setCurId] = useState<string>("");

  useEffect(() => {
    setCurId(list[0]?.id ?? "");
    setRefId(list[1]?.id ?? "");
  }, [list]);

  if (creating) return <PostureAssessmentForm studentId={studentId} onDone={() => setCreating(false)} />;
  if (isLoading) return <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (error) return (
    <div className="space-y-2 text-sm text-destructive">
      <p>Não foi possível carregar as avaliações.</p>
      <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
    </div>
  );

  const ref = list.find((a) => a.id === refId);
  const cur = list.find((a) => a.id === curId);
  const timeline = [...list].reverse();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Observação educacional, não diagnóstico.</p>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Registrar avaliação</Button>
      </div>

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma avaliação postural registrada.</p>
      ) : (
        <>
          <div className="space-y-2">
            {list.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{fmtDate(a.assessed_at)}</span>
                  <Badge variant="outline">Nível {levelLabel(a.progression_level)}</Badge>
                  {(a.referral_recommended || hasRedFlag(a.red_flags)) && (
                    <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Encaminhamento</Badge>
                  )}
                  {a.complaint && <span className="text-xs text-muted-foreground">{a.complaint}</span>}
                </div>
                <Button size="icon" variant="ghost" aria-label="Excluir avaliação" disabled={del.isPending}
                  onClick={() => {
                    if (!confirm("Excluir esta avaliação e suas fotos?")) return;
                    del.mutate(a, { onError: () => toast.error("Não foi possível excluir.") });
                  }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Progressão ao longo do tempo</h3>
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {timeline.map((a) => (
                <div key={a.id} className="flex min-w-[56px] flex-col items-center gap-1">
                  <div className="w-6 rounded-t bg-primary/70" style={{ height: `${(a.progression_level ?? 0) * 12 + 4}px` }} />
                  <span className="text-[10px] text-muted-foreground">{fmtDate(a.assessed_at)}</span>
                  <span className="text-[10px]">{a.progression_level ?? "–"}</span>
                </div>
              ))}
            </div>
          </div>

          {list.length >= 2 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Comparativo</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {[["Referência", refId, setRefId], ["Atual", curId, setCurId]].map(([label, val, setter]) => (
                  <select key={label as string} aria-label={label as string} value={val as string}
                    onChange={(e) => (setter as (s: string) => void)(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {list.map((a) => <option key={a.id} value={a.id}>{label as string}: {fmtDate(a.assessed_at)}</option>)}
                  </select>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {ref && <Column a={ref} />}
                {cur && <Column a={cur} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
