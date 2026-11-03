// src/components/student/WorkoutGuideDrawer.tsx
// Guia rápido "Como ler o seu treino" (Regras de Ouro), acionado por um botão
// discreto no topo da tela de rotina de treinos (WorkoutPlan.tsx). Autocontido
// (dono do próprio estado de abertura).
//
// Revelação progressiva: com o item fechado o aluno já vê o título e 2–3
// selos com a essência da regra; ao tocar, abre a explicação, um mini-visual
// e o callout "O óbvio que precisa ser dito". O conteúdo vive em
// @/lib/periodizationCopy (GOLDEN_RULES).
//
// WorkoutRulesContent é reutilizado como aba "Regras" do guia unificado de
// periodização (PeriodizationGuideDrawer).

import { type ReactNode, useState } from "react";
import { ArrowRight, BookOpenText, Check, Flame, RotateCcw, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GuideCallout, GuideChip, GuideShell } from "@/components/student/GuideParts";
import {
  GOLDEN_RULES,
  RULES_INTRO,
  RULES_OBVIOUS_TITLE,
  type GoldenRuleKey,
} from "@/lib/periodizationCopy";

interface WorkoutGuideDrawerProps {
  /** Substitui o botão-gatilho padrão (ex: pra usar um ícone em vez do texto). */
  trigger?: ReactNode;
  className?: string;
}

const RULE_ICON = {
  "serie-zero": Flame,
  "falha-tecnica": Target,
  faltou: RotateCcw,
} as const;

// ───────────────────────────── Mini-visuais ─────────────────────────────

/** Série Zero (tracejada, "não conta") + as séries valendo da ficha. */
function SetsVisual() {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/50 px-2 py-1 text-center">
          <span className="text-[10px] font-bold leading-tight">Série Zero</span>
          <span className="text-[10px] text-muted-foreground leading-tight">leve · não conta</span>
        </span>
        <span className="text-xs font-bold text-muted-foreground" aria-hidden>+</span>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="flex flex-1 flex-col items-center justify-center rounded-md bg-primary px-1 py-1 text-primary-foreground"
          >
            <span className="text-[10px] font-bold leading-tight">Série {n}</span>
            <span className="text-[10px] opacity-80 leading-tight">vale</span>
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Exemplo: a ficha pede 3 séries.</p>
    </div>
  );
}

/** Falta: a fila anda pela ficha, não pelo dia da semana. */
function QueueVisual() {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-center">
          <span className="flex items-center justify-center gap-1 text-[11px] font-bold text-red-500">
            <X className="w-3 h-3" aria-hidden /> Hoje: Perna
          </span>
          <span className="block text-[10px] text-muted-foreground">faltou</span>
        </span>
        <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-center">
          <span className="flex items-center justify-center gap-1 text-[11px] font-bold">
            <Check className="w-3 h-3 text-primary" aria-hidden /> Amanhã: Perna
          </span>
          <span className="block text-[10px] text-muted-foreground">segue a ficha</span>
        </span>
      </div>
    </div>
  );
}

function RuleVisual({ ruleKey }: { ruleKey: GoldenRuleKey }) {
  if (ruleKey === "serie-zero") return <SetsVisual />;
  if (ruleKey === "faltou") return <QueueVisual />;
  return null;
}

// ───────────────────────────── Conteúdo ─────────────────────────────

/** As 3 regras de ouro — reutilizadas na aba "Regras" do guia unificado. */
export function WorkoutRulesContent() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">{RULES_INTRO}</p>

      <Accordion type="single" collapsible className="space-y-2">
        {GOLDEN_RULES.map((rule, index) => {
          const Icon = RULE_ICON[rule.key];
          return (
            <AccordionItem
              key={rule.key}
              value={rule.key}
              className="rounded-xl border border-border bg-card px-3"
            >
              <AccordionTrigger className="py-3 text-left hover:no-underline gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="w-4 h-4" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-bold leading-tight">
                      {index + 1}. {rule.title}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {rule.chips.map((chip) => (
                        <GuideChip key={chip}>{chip}</GuideChip>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-2.5">
                <p className="text-xs text-foreground leading-relaxed">{rule.rule}</p>
                <RuleVisual ruleKey={rule.key} />
                <GuideCallout tone="warn" title={RULES_OBVIOUS_TITLE}>
                  {rule.obvious}
                </GuideCallout>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

// ───────────────────────────── Gatilho + casca ─────────────────────────────

export function WorkoutGuideDrawer({ trigger, className }: WorkoutGuideDrawerProps) {
  const [open, setOpen] = useState(false);

  const defaultTrigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className ?? "h-7 px-2.5 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"}
    >
      <BookOpenText className="w-3.5 h-3.5" /> Como ler meu treino
    </Button>
  );

  return (
    <GuideShell
      open={open}
      onOpenChange={setOpen}
      title="Guia Rápido: Como ler o seu treino"
      description="Guia rápido com as regras de ouro: Série Zero, falha técnica e o que fazer ao faltar um treino."
      trigger={trigger ?? defaultTrigger}
    >
      <WorkoutRulesContent />
    </GuideShell>
  );
}
