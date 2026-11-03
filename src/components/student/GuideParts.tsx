// src/components/student/GuideParts.tsx
// Peças visuais compartilhadas pelos guias do aluno (WorkoutGuideDrawer e
// PeriodizationGuideDrawer): casca responsiva (Drawer no mobile, Dialog no
// desktop), callouts e medidores. Sem regra de negócio aqui — o conteúdo vem
// de @/lib/periodizationCopy.
//
// Casca: mesmo padrão já usado em ExerciseVideoSheet / MobilitySuggestedDrawer
// (ramificação por useIsMobile) + o fix max-h-[85dvh] com área interna rolável
// (dvh desconta a barra de endereço do navegador; vh não).

import { type ReactNode, type RefObject } from "react";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ───────────────────────────── Casca responsiva ─────────────────────────────

interface GuideShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Descrição para leitores de tela (não aparece na tela). */
  description: string;
  trigger: ReactNode;
  /** Conteúdo fixo entre o título e a área rolável (ex.: barra de abas). */
  subheader?: ReactNode;
  /** Permite ao conteúdo voltar a área rolável ao topo (ex.: troca de aba). */
  scrollRef?: RefObject<HTMLDivElement>;
  children: ReactNode;
}

export function GuideShell({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  subheader,
  scrollRef,
  children,
}: GuideShellProps) {
  const isMobile = useIsMobile();
  const triggerEl = <div onClick={() => onOpenChange(true)}>{trigger}</div>;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {triggerEl}
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 shrink-0 text-left">
            <DrawerTitle className="text-left truncate min-w-0">{title}</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Fechar guia"
                className="rounded-full p-2 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <DrawerDescription className="sr-only">{description}</DrawerDescription>
          {subheader && <div className="shrink-0 px-4 pb-2">{subheader}</div>}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-6"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {triggerEl}
      <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        {subheader && <div className="shrink-0 px-5 pb-2">{subheader}</div>}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Callout ─────────────────────────────

export type CalloutTone = "warn" | "danger" | "info";

const CALLOUT_STYLE: Record<CalloutTone, { box: string; text: string; icon: string }> = {
  warn: { box: "border-amber-500/30 bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: "text-amber-500" },
  danger: { box: "border-red-500/30 bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: "text-red-500" },
  info: { box: "border-primary/30 bg-primary/10", text: "text-foreground", icon: "text-primary" },
};

const CALLOUT_ICON = { warn: AlertTriangle, danger: OctagonAlert, info: Info } as const;

export function GuideCallout({
  tone = "warn",
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const s = CALLOUT_STYLE[tone];
  const Icon = CALLOUT_ICON[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border p-2.5", s.box, className)}>
      <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", s.icon)} aria-hidden />
      <div className={cn("min-w-0 text-xs leading-relaxed", s.text)}>
        {title && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────────── Selo ─────────────────────────────

export function GuideChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-foreground/80 leading-tight",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ───────────────────────────── Medidores ─────────────────────────────

/** Medidor de carga relativa: 3 barras crescentes (1 = leve, 3 = máxima). */
export function LoadMeter({
  level,
  label,
  barClass = "bg-primary",
}: {
  level: 1 | 2 | 3;
  label: string;
  barClass?: string;
}) {
  const heights = ["h-2", "h-3", "h-4"];
  return (
    <span className="inline-flex items-end gap-0.5" role="img" aria-label={`Peso: ${label}`}>
      {heights.map((h, i) => (
        <span
          key={h}
          className={cn("w-1.5 rounded-sm", h, i < level ? barClass : "bg-muted-foreground/25")}
        />
      ))}
    </span>
  );
}

/**
 * Medidor de repetições (ex.: 8 segmentos). Os segmentos a partir de
 * `rangeStart` ganham contorno para mostrar a faixa da ficha (ex.: 5 a 8).
 */
export function RepMeter({
  filled,
  total,
  rangeStart,
  barClass = "bg-primary",
}: {
  filled: number;
  total: number;
  rangeStart?: number;
  barClass?: string;
}) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const inRange = rangeStart !== undefined && n >= rangeStart;
        return (
          <span
            key={n}
            className={cn(
              "h-2 flex-1 rounded-sm",
              n <= filled ? barClass : "bg-muted",
              inRange && n > filled && "ring-1 ring-inset ring-muted-foreground/40",
            )}
          />
        );
      })}
    </span>
  );
}
