// src/components/student/PeriodizationGuideDrawer.tsx
// Menu "Como entender meu treino e periodização" — aberto pela faixa da semana
// (WorkoutStrategyHeader). Mesma casca responsiva do WorkoutGuideDrawer.
//
// Arquitetura da informação (3 abas, uma pergunta por aba):
//   • Semanas     → "O que faço NESTA semana?"  (semana ativa em destaque; as
//                    outras ficam recolhidas, para não confundir as regras)
//   • Subir carga → "Quando e quanto aumento o peso?" (passo a passo + timeline)
//   • Regras      → "O que vale sempre?" (Série Zero, Falha Técnica, Faltas)
//
// "Você está aqui": vem do prop `currentPhase` (já calculado pelo header a
// partir da semana atual do aluno). A aba abre sempre em "Semanas".
// Todo o texto vive em @/lib/periodizationCopy.

import { type ReactNode, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuideCallout, GuideChip, GuideShell, LoadMeter, RepMeter } from "@/components/student/GuideParts";
import { WorkoutRulesContent } from "@/components/student/WorkoutGuideDrawer";
import { WEEK_FOCUS_COLOR, type WeekFocusKey } from "@/lib/periodizationDefaults";
import {
  AVOID_TITLE,
  DELOAD_COPY,
  GO_TO_LOAD_LABEL,
  GUIDE_TABS,
  HERE_BADGE,
  HOW_TO_TITLE,
  LADDER_BELOW_FORCE,
  LADDER_TITLE,
  LOAD_ALERT,
  LOAD_SECTION,
  MENU_INTRO,
  OTHER_WEEK_NOTE,
  PERIODIZATION_MENU_TITLE,
  PHASES,
  PHASE_ORDER,
  type GuideTabKey,
  type PhaseKey,
} from "@/lib/periodizationCopy";

interface Props {
  trigger: ReactNode;
  currentPhase: PhaseKey | "deload" | null;
}

// Mesmas cores da faixa da semana (WEEK_FOCUS_COLOR) — o aluno associa a cor.
const PHASE_FOCUS: Record<PhaseKey, WeekFocusKey> = {
  forca: "peso",
  qualidade: "tecnica",
  pump: "resistencia",
};

// Classes literais (o Tailwind precisa enxergá-las inteiras no código).
const PHASE_BAR: Record<PhaseKey, string> = {
  forca: "bg-orange-500",
  qualidade: "bg-blue-500",
  pump: "bg-emerald-500",
};

const TAB_ICON: Record<GuideTabKey, typeof CalendarDays> = {
  semanas: CalendarDays,
  carga: TrendingUp,
  regras: ListChecks,
};

function HereBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground whitespace-nowrap",
        className,
      )}
    >
      {HERE_BADGE}
    </span>
  );
}

// ───────────────────────────── Aba 1 · Semanas ─────────────────────────────

/** Comparativo visual do peso das 3 semanas; a ativa fica destacada. */
function LoadLadder({ activeKey }: { activeKey: PhaseKey | null }) {
  return (
    <div className="space-y-2 pt-1">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{LADDER_TITLE}</p>
      <ul className="grid grid-cols-3 gap-2">
        {PHASE_ORDER.map((k) => {
          const p = PHASES[k];
          const cc = WEEK_FOCUS_COLOR[PHASE_FOCUS[k]];
          const active = activeKey === k;
          return (
            <li
              key={k}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-lg border px-1.5 pb-2 pt-3 text-center",
                active ? `${cc.border} ${cc.bg}` : "border-border bg-muted/30",
              )}
            >
              {active && <HereBadge className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5" />}
              <LoadMeter level={p.load.level} label={p.load.label} barClass={PHASE_BAR[k]} />
              <p className="text-xs font-bold leading-tight">{p.name}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{p.load.label}</p>
              {k !== "forca" && (
                <p className="flex items-center gap-0.5 text-[10px] font-semibold leading-tight text-foreground/80">
                  <ArrowDown className="w-2.5 h-2.5 shrink-0" aria-hidden /> {LADDER_BELOW_FORCE}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Corpo de uma semana: selos, "como fazer" e erro clássico. */
function PhaseBody({ phaseKey }: { phaseKey: PhaseKey }) {
  const p = PHASES[phaseKey];
  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground leading-relaxed">
        <strong>Objetivo:</strong> {p.objective}
      </p>
      <div className="flex flex-wrap gap-1">
        {p.quick.map((q) => (
          <GuideChip key={q}>{q}</GuideChip>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{HOW_TO_TITLE}</p>
        <ul className="space-y-1.5">
          {p.howTo.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                {h.lead && <strong className="text-foreground">{h.lead} </strong>}
                {h.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <GuideCallout tone="danger" title={AVOID_TITLE}>
        {p.avoid}
      </GuideCallout>
    </div>
  );
}

/** Semana ativa: card em destaque, sempre aberto. */
function ActivePhaseCard({ phaseKey, onGoToLoad }: { phaseKey: PhaseKey; onGoToLoad: () => void }) {
  const p = PHASES[phaseKey];
  const cc = WEEK_FOCUS_COLOR[PHASE_FOCUS[phaseKey]];
  return (
    <section
      aria-label={`${p.menuTitle} — ${HERE_BADGE}`}
      className={cn("space-y-3 rounded-xl border-2 p-3.5", cc.border, cc.bg)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <HereBadge />
          <h3 className="pt-1 text-base font-black leading-tight">{p.menuTitle}</h3>
          <p className="text-[11px] text-muted-foreground">{p.technicalName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <LoadMeter level={p.load.level} label={p.load.label} barClass={PHASE_BAR[phaseKey]} />
          <span className={cn("text-[10px] font-bold", cc.text)}>Peso: {p.load.label}</span>
        </div>
      </div>

      <PhaseBody phaseKey={phaseKey} />

      <button
        type="button"
        onClick={onGoToLoad}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <TrendingUp className="w-3.5 h-3.5" aria-hidden /> {GO_TO_LOAD_LABEL}
        <ArrowRight className="w-3.5 h-3.5 opacity-60" aria-hidden />
      </button>
    </section>
  );
}

function DeloadCard() {
  return (
    <section
      aria-label={`${DELOAD_COPY.menuTitle} — ${HERE_BADGE}`}
      className="space-y-2 rounded-xl border-2 border-sky-500/40 bg-sky-500/10 p-3.5"
    >
      <HereBadge />
      <div>
        <h3 className="text-base font-black leading-tight">{DELOAD_COPY.menuTitle}</h3>
        <p className="text-[11px] text-muted-foreground">{DELOAD_COPY.technicalName}</p>
      </div>
      <p className="text-xs text-foreground leading-relaxed">
        <strong>Objetivo:</strong> {DELOAD_COPY.objective}
      </p>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-sky-500" aria-hidden />
        <span>{DELOAD_COPY.howTo}</span>
      </p>
    </section>
  );
}

function WeeksPanel({
  currentPhase,
  onGoToLoad,
}: {
  currentPhase: Props["currentPhase"];
  onGoToLoad: () => void;
}) {
  const activeKey: PhaseKey | null = currentPhase && currentPhase !== "deload" ? currentPhase : null;
  const isDeload = currentPhase === "deload";
  const others = PHASE_ORDER.filter((k) => k !== activeKey);
  const hasHero = activeKey !== null || isDeload;

  return (
    <div className="space-y-4">
      <GuideCallout tone="warn" title="Atenção">
        <strong>{LOAD_ALERT.title}.</strong> {LOAD_ALERT.text}
      </GuideCallout>

      <LoadLadder activeKey={activeKey} />

      {isDeload && <DeloadCard />}
      {activeKey && <ActivePhaseCard phaseKey={activeKey} onGoToLoad={onGoToLoad} />}

      <section className="space-y-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {hasHero ? "Outras semanas do ciclo" : "Semanas do ciclo"}
        </h3>
        <Accordion type="single" collapsible>
          {others.map((k) => {
            const p = PHASES[k];
            return (
              <AccordionItem key={k} value={k}>
                <AccordionTrigger className="py-3 text-left hover:no-underline gap-2">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-1">
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight">{p.menuTitle}</p>
                      <p className="text-[11px] font-normal text-muted-foreground">{p.technicalName}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <LoadMeter level={p.load.level} label={p.load.label} barClass={PHASE_BAR[k]} />
                      <span className="text-[10px] font-semibold text-muted-foreground">{p.load.label}</span>
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {hasHero && <p className="text-[11px] italic text-muted-foreground">{OTHER_WEEK_NOTE}</p>}
                  <PhaseBody phaseKey={k} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      <p className="text-[11px] text-muted-foreground leading-relaxed">{MENU_INTRO}</p>
    </div>
  );
}

// ───────────────────────────── Aba 2 · Subir carga ─────────────────────────────

const TIMELINE_TONE: Record<"hold" | "top" | "up", { box: string; bar: string }> = {
  hold: { box: "border-border bg-muted/30", bar: "bg-primary" },
  top: { box: "border-emerald-500/40 bg-emerald-500/10", bar: "bg-emerald-500" },
  up: { box: "border-orange-500/40 bg-orange-500/10", bar: "bg-orange-500" },
};

/** Treino 1 → Treino 4: o "dente de serra" da progressão, em cartões. */
function ProgressionTimeline() {
  const ex = LOAD_SECTION.example;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div>
        <p className="text-sm font-bold leading-tight">{ex.title}</p>
        <p className="text-[11px] text-muted-foreground">{ex.subtitle}</p>
      </div>
      <ol className="space-y-1">
        {ex.steps.map((s, i) => {
          const tone = TIMELINE_TONE[s.tone];
          return (
            <li key={s.label}>
              <div className="grid grid-cols-[3.25rem_1fr] items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase leading-tight text-muted-foreground">{s.label}</span>
                <div className={cn("space-y-1.5 rounded-lg border p-2", tone.box)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black leading-none">{s.load}</span>
                    {s.badge && (
                      <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                        {s.badge}
                      </span>
                    )}
                  </div>
                  <RepMeter filled={s.reps} total={ex.total} rangeStart={ex.rangeStart} barClass={tone.bar} />
                  <p className="text-[11px] font-semibold leading-tight text-foreground/90">{s.note}</p>
                </div>
              </div>
              {i < ex.steps.length - 1 && (
                <ArrowDown className="ml-[1.4rem] mt-1 h-3 w-3 text-muted-foreground" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-muted-foreground">
        Os quadradinhos mostram as repetições da última série; os contornados são a faixa da ficha ({ex.rangeStart} a {ex.total}).
      </p>
    </div>
  );
}

function StrengthProgression() {
  return (
    <div className="space-y-4 pb-1">
      <ol className="space-y-3">
        {LOAD_SECTION.strengthSteps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-bold leading-tight">{s.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              {s.emphasis && <p className="text-xs font-bold leading-relaxed text-foreground">{s.emphasis}</p>}
            </div>
          </li>
        ))}
      </ol>

      <ProgressionTimeline />

      <div className="space-y-1.5">
        <h4 className="flex items-center gap-1.5 text-xs font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" aria-hidden /> {LOAD_SECTION.safetyTitle}
        </h4>
        <ul className="space-y-1.5">
          {LOAD_SECTION.safetyRules.map((r) => (
            <li key={r} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OtherWeekRuleCard({
  item,
  highlighted,
}: {
  item: (typeof LOAD_SECTION.other)[number];
  highlighted: boolean;
}) {
  const cc = WEEK_FOCUS_COLOR[PHASE_FOCUS[item.key]];
  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border p-3",
        highlighted ? `border-2 ${cc.border} ${cc.bg}` : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", cc.pill)}>
          {item.lead}
        </span>
        {highlighted && <HereBadge />}
      </div>
      <p className="text-xs leading-relaxed text-foreground">{item.text}</p>
      {item.inviolable && (
        <GuideCallout tone="danger" title={LOAD_SECTION.inviolableTitle}>
          {item.inviolable}
        </GuideCallout>
      )}
    </div>
  );
}

function LoadPanel({ currentPhase }: { currentPhase: Props["currentPhase"] }) {
  const activeKey: PhaseKey | null = currentPhase && currentPhase !== "deload" ? currentPhase : null;
  const activeOther = LOAD_SECTION.other.find((o) => o.key === activeKey) ?? null;
  const restOthers = LOAD_SECTION.other.filter((o) => o.key !== activeKey);
  // Na Força (ou sem contexto) a regra completa abre sozinha; nas outras
  // semanas ela fica recolhida, para não ser confundida com a regra do dia.
  const strengthDefault = activeOther ? [] : ["forca"];

  return (
    <div className="space-y-4">
      <GuideCallout tone="info" title={LOAD_SECTION.title}>
        {LOAD_SECTION.general}
      </GuideCallout>

      {activeOther && <OtherWeekRuleCard item={activeOther} highlighted />}

      <Accordion type="multiple" defaultValue={strengthDefault}>
        <AccordionItem
          value="forca"
          className={cn(
            "rounded-xl border px-3",
            activeKey === "forca" ? "border-2 border-orange-500/40 bg-orange-500/10" : "border-border bg-card",
          )}
        >
          <AccordionTrigger className="py-3 text-left hover:no-underline gap-2">
            <div className="min-w-0 space-y-0.5">
              {activeKey === "forca" && <HereBadge />}
              <p className="text-sm font-bold leading-tight">{LOAD_SECTION.strengthTitle}: regra completa</p>
              <p className="text-[11px] font-normal text-muted-foreground">{LOAD_SECTION.strengthSubtitle}</p>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StrengthProgression />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {LOAD_SECTION.otherTitle}
        </h3>
        {restOthers.map((o) => (
          <OtherWeekRuleCard key={o.key} item={o} highlighted={false} />
        ))}
      </section>
    </div>
  );
}

// ───────────────────────────── Gatilho + casca ─────────────────────────────

export function PeriodizationGuideDrawer({ trigger, currentPhase }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuideTabKey>("semanas");
  const scrollRef = useRef<HTMLDivElement>(null);

  const changeTab = (next: string) => {
    setTab(next as GuideTabKey);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setTab("semanas");
    setOpen(next);
  };

  const tabBar = (
    <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
      {GUIDE_TABS.map((t) => {
        const Icon = TAB_ICON[t.key];
        return (
          <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-1.5 py-2 text-xs">
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t.label}</span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  );

  return (
    // O Tabs envolve a casca inteira (o contexto atravessa o portal), assim a
    // barra de abas fica fixa fora da área rolável. "contents" = sem caixa.
    <Tabs value={tab} onValueChange={changeTab} className="contents">
      <GuideShell
        open={open}
        onOpenChange={handleOpenChange}
        title={PERIODIZATION_MENU_TITLE}
        description="Explicação de cada semana do ciclo, de como subir a carga e das regras de ouro do treino."
        trigger={trigger}
        subheader={tabBar}
        scrollRef={scrollRef}
      >
        <TabsContent value="semanas" className="mt-2">
          <WeeksPanel currentPhase={currentPhase} onGoToLoad={() => changeTab("carga")} />
        </TabsContent>
        <TabsContent value="carga" className="mt-2">
          <LoadPanel currentPhase={currentPhase} />
        </TabsContent>
        <TabsContent value="regras" className="mt-2">
          <WorkoutRulesContent />
        </TabsContent>
      </GuideShell>
    </Tabs>
  );
}
