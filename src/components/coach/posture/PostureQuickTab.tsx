/**
 * Aba "Postura" da ficha do aluno: escolher o envio (check-in ou anamnese),
 * marcar os desvios em poucos toques e ver a evolução de cada desvio no tempo.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Minus, AlertTriangle } from "lucide-react";
import {
  GRADE_META, POSTURE_DEVIATIONS, countPresent, deviationTrend,
  type PostureQuickCheck, type PostureTrend,
} from "@/lib/postureQuick";
import { POSTURE_SQL_MISSING_MSG, usePostureQuickChecks, usePostureSources } from "@/hooks/usePostureQuickChecks";
import PostureQuickEditor from "./PostureQuickEditor";
import { cn } from "@/lib/utils";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

function TrendBadge({ trend }: { trend: PostureTrend }) {
  if (!trend) return null;
  const map = {
    melhorou: { icon: <TrendingDown className="w-3 h-3" />, label: "Melhorou", cls: "text-emerald-600 dark:text-emerald-400" },
    igual:    { icon: <Minus className="w-3 h-3" />,        label: "Igual",    cls: "text-muted-foreground" },
    piorou:   { icon: <TrendingUp className="w-3 h-3" />,   label: "Piorou",   cls: "text-red-600 dark:text-red-400" },
  }[trend];
  return <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", map.cls)}>{map.icon}{map.label}</span>;
}

/** Evolução de cada desvio: um chip por data em que foi avaliado. */
export function PostureTimeline({ checks }: { checks: PostureQuickCheck[] }) {
  const ordered = useMemo(
    () => [...checks].sort((a, b) => new Date(a.source_date).getTime() - new Date(b.source_date).getTime()),
    [checks],
  );
  const rows = POSTURE_DEVIATIONS
    .map((d) => ({
      d,
      points: ordered.filter((c) => c.findings[d.key]).map((c) => ({ date: c.source_date, grade: c.findings[d.key]! })),
      trend: deviationTrend(ordered, d.key),
    }))
    .filter((r) => r.points.length > 0);

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Nenhuma marcação ainda. Marque o primeiro envio acima.</p>;
  }
  return (
    <ul className="space-y-2" data-testid="posture-timeline">
      {rows.map(({ d, points, trend }) => (
        <li key={d.key} className="rounded-lg border border-border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{d.label}</span>
            <TrendBadge trend={trend} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {points.map((p, i) => (
              <span
                key={`${p.date}-${i}`}
                className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded-full border font-semibold", GRADE_META[p.grade].cls)}
                title={GRADE_META[p.grade].label}
              >
                {fmt(p.date)} · {GRADE_META[p.grade].short}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function PostureQuickTab({ studentId }: { studentId: string }) {
  const sources = usePostureSources(studentId);
  const checksQ = usePostureQuickChecks(studentId);
  const checks = useMemo(() => checksQ.data?.checks ?? [], [checksQ.data]);
  const [sourceId, setSourceId] = useState<string>("");

  // Padrão: o envio mais recente com foto ainda sem marcação; senão o mais recente com foto.
  useEffect(() => {
    if (sourceId || !sources.data || sources.data.length === 0) return;
    const withPhotos = sources.data.filter((s) => Object.keys(s.photos).length > 0);
    const marked = new Set(checks.map((c) => `${c.source_kind}:${c.source_id}`));
    const pick = withPhotos.find((s) => !marked.has(`${s.kind}:${s.id}`)) ?? withPhotos[0] ?? sources.data[0];
    setSourceId(`${pick.kind}:${pick.id}`);
  }, [sources.data, checks, sourceId]);

  const source = sources.data?.find((s) => `${s.kind}:${s.id}` === sourceId) ?? null;
  const existing = source ? checks.find((c) => c.source_kind === source.kind && c.source_id === source.id) ?? null : null;

  if (sources.isLoading || checksQ.isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }
  if (checksQ.data?.missingTable) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{POSTURE_SQL_MISSING_MSG}</span>
      </div>
    );
  }
  if (!sources.data || sources.data.length === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-8">Sem anamnese nem check-in com fotos ainda.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground" htmlFor="posture-source">Fotos de</label>
        <select
          id="posture-source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="w-full text-base md:text-sm rounded-md border border-border bg-background px-2 py-2"
        >
          {sources.data.map((s) => {
            const c = checks.find((x) => x.source_kind === s.kind && x.source_id === s.id);
            const n = c ? countPresent(c.findings) : 0;
            const tag = c ? ` · marcado (${n === 0 ? "tudo ok" : `${n} para observar/investigar`})` : Object.keys(s.photos).length === 0 ? " · sem fotos" : "";
            return <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.label}{tag}</option>;
          })}
        </select>
      </div>

      {source && (
        <PostureQuickEditor studentId={studentId} source={source} existing={existing} />
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Evolução da postura</h3>
        <PostureTimeline checks={checks} />
      </div>
    </div>
  );
}
