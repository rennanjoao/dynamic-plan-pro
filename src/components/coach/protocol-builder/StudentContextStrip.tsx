/**
 * Faixa do aluno (auditoria de 21/11/2026, Pacote C): objetivo, peso,
 * último check-in, disponibilidade de treino, lesões e alergias — à vista
 * enquanto o coach monta o protocolo. "Anamnese completa" abre o painel.
 *
 * Os valores passam pelo <Private>, como o nome do aluno: com o modo
 * privacidade ligado (gravação de tela), ficam borrados.
 */
import type { ReactNode } from "react";
import { AlertTriangle, CalendarCheck, ClipboardList, Dumbbell, Scale, Target } from "lucide-react";
import { Private, usePrivacyMode } from "@/components/coach/PrivacyMode";
import { cn } from "@/lib/utils";
import { useStudentContext } from "@/hooks/useStudentContext";
import { relativeDays } from "@/lib/studentContext";

function Item({
  icon, label, children, tone = "default", title, testId,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  tone?: "default" | "warn";
  title?: string;
  testId?: string;
}) {
  // Com o modo privacidade ligado, o texto completo não pode vazar pela dica do mouse.
  const { privacy } = usePrivacyMode();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0 max-w-[240px] sm:max-w-[320px] rounded-md border px-2 py-1 text-[11px]",
        tone === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border/60 bg-muted/30 text-foreground/90",
      )}
      title={privacy ? undefined : title}
      data-testid={testId}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium"><Private>{children}</Private></span>
    </span>
  );
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

export function StudentContextStrip({ studentId, onOpenAnamnesis }: { studentId: string; onOpenAnamnesis: () => void }) {
  const { data: ctx, isLoading } = useStudentContext(studentId);
  if (isLoading || !ctx) return <div className="h-8" aria-hidden />;

  const trainingTxt = [ctx.trainingDays, ctx.level].filter(Boolean).join(" · ");
  const anamnesisLink = (
    <button
      type="button"
      onClick={onOpenAnamnesis}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline underline-offset-2 shrink-0"
      data-testid="student-context-anamnesis"
    >
      <ClipboardList className="w-3.5 h-3.5" /> Anamnese completa
    </button>
  );

  if (!ctx.hasAnamnesis && !ctx.lastCheckinAt) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground" data-testid="student-context">
        <span>Sem anamnese nem check-in ainda — monte com o que você já sabe do aluno.</span>
        {anamnesisLink}
      </div>
    );
  }

  return (
    // Celular: uma linha que rola para o lado (não empurra o protocolo para baixo).
    <div
      className="flex items-center gap-1.5 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="student-context"
    >
      {ctx.goal && <Item icon={<Target className="w-3.5 h-3.5" />} label="Objetivo" testId="ctx-goal">{ctx.goal}</Item>}
      {/* Avisos logo depois do objetivo: no celular a faixa rola para o lado e eles não podem ficar escondidos. */}
      {ctx.injuries && (
        <Item icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Lesões" tone="warn" title={ctx.injuries} testId="ctx-injuries">{ctx.injuries}</Item>
      )}
      {ctx.allergies && (
        <Item icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Alergias" tone="warn" title={ctx.allergies} testId="ctx-allergies">{ctx.allergies}</Item>
      )}
      {ctx.weightKg != null && (
        <Item
          icon={<Scale className="w-3.5 h-3.5" />}
          label="Peso"
          title={ctx.weightSource === "anamnesis" ? "Peso informado na anamnese" : "Peso do último check-in"}
          testId="ctx-weight"
        >
          {ctx.weightKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
          {ctx.weightAt ? ` (${ctx.weightSource === "anamnesis" ? "anamnese " : ""}${fmtDate(ctx.weightAt)})` : ""}
        </Item>
      )}
      <Item icon={<CalendarCheck className="w-3.5 h-3.5" />} label="Último check-in" testId="ctx-checkin">
        {ctx.lastCheckinAt ? relativeDays(ctx.lastCheckinAt) : "nenhum"}
      </Item>
      {trainingTxt && (
        <Item icon={<Dumbbell className="w-3.5 h-3.5" />} label="Treina" title={trainingTxt} testId="ctx-training">{trainingTxt}</Item>
      )}
      {anamnesisLink}
    </div>
  );
}
