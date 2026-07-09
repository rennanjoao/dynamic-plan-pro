/**
 * CheckinPayloadAnswers.tsx
 * Renderiza respostas do payload de um check-in (humor, dieta, treino, sono, etc.)
 * agrupadas pelas seções declarativas de CHECKIN_SECTIONS.
 * Compartilhado entre CoachDashboard e EvolutionComparison.
 */
import { CHECKIN_SECTIONS } from "@/lib/checkInSchema";

const IGNORED = new Set(["metrics_raw", "fotos", "_updated"]);

export default function CheckinPayloadAnswers({
  payload,
}: {
  payload: Record<string, unknown> | null | undefined;
}) {
  if (!payload) return null;
  const sections = CHECKIN_SECTIONS.map((sec) => {
    const filled = sec.fields
      .filter((f) => !IGNORED.has(f.key))
      .map((f) => ({ label: f.label, value: (payload as Record<string, unknown>)[f.key] }))
      .filter(({ value }) => value !== undefined && value !== null && value !== "");
    return { title: sec.title, filled };
  }).filter((s) => s.filled.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      {sections.map((sec) => (
        <div key={sec.title}>
          <p className="text-[10px] font-bold uppercase text-primary mb-1">{sec.title}</p>
          <div className="space-y-1">
            {sec.filled.map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-3 text-xs py-0.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-right max-w-[60%] whitespace-pre-wrap">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}