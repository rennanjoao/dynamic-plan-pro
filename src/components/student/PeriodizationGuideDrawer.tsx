// Menu "Como ler minha periodização" — mesmo padrão do WorkoutGuideDrawer
// (Drawer no mobile, Dialog no desktop, área rolável com max-h-[85dvh]).
import { useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";
import { X, TrendingUp, ShieldCheck } from "lucide-react";
import {
  PHASES, PHASE_ORDER, DELOAD_COPY, MENU_INTRO, LOAD_SECTION, HERE_BADGE,
  PERIODIZATION_MENU_TITLE, type PhaseKey,
} from "@/lib/periodizationCopy";

interface Props {
  trigger: ReactNode;
  currentPhase: PhaseKey | "deload" | null;
}

export function PeriodizationGuideDrawer({ trigger, currentPhase }: Props) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const title = PERIODIZATION_MENU_TITLE;

  const badge = (
    <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
      {HERE_BADGE}
    </span>
  );

  const body = (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground leading-relaxed">{MENU_INTRO}</p>

      <Accordion type="single" collapsible defaultValue={currentPhase ?? undefined}>
        {PHASE_ORDER.map((k) => {
          const p = PHASES[k];
          return (
            <AccordionItem key={k} value={k}>
              <AccordionTrigger className="text-left">
                <div>
                  <div className="text-sm font-bold flex items-center">
                    {p.menuTitle}
                    {currentPhase === k && badge}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-normal">{p.technicalName}</div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p><strong className="text-foreground">Objetivo:</strong> {p.objective}</p>
                <p className="font-bold text-foreground">Como fazer:</p>
                <ul className="list-disc pl-4 space-y-1">
                  {p.howTo.map((h, i) => (
                    <li key={i}>
                      {h.lead && <strong className="text-foreground">{h.lead} </strong>}
                      {h.text}
                    </li>
                  ))}
                </ul>
                <p className="rounded-md border border-primary/30 bg-primary/10 p-2">
                  <strong className="text-foreground">Evite:</strong> {p.avoid}
                </p>
              </AccordionContent>
            </AccordionItem>
          );
        })}
        <AccordionItem value="deload">
          <AccordionTrigger className="text-left">
            <div>
              <div className="text-sm font-bold flex items-center">
                {DELOAD_COPY.menuTitle}
                {currentPhase === "deload" && badge}
              </div>
              <div className="text-[11px] text-muted-foreground font-normal">{DELOAD_COPY.technicalName}</div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Objetivo:</strong> {DELOAD_COPY.objective}</p>
            <p><strong className="text-foreground">Como fazer:</strong> {DELOAD_COPY.howTo}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="w-4 h-4 text-primary shrink-0" /> {LOAD_SECTION.title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{LOAD_SECTION.intro}</p>
        <h4 className="text-xs font-bold text-foreground">{LOAD_SECTION.strengthTitle}</h4>
        <ol className="list-decimal pl-4 space-y-1 text-xs text-muted-foreground leading-relaxed">
          {LOAD_SECTION.strengthSteps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-foreground leading-relaxed">
          {LOAD_SECTION.example}
        </div>
        <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" /> {LOAD_SECTION.safetyTitle}
        </h4>
        <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground leading-relaxed">
          {LOAD_SECTION.safetyRules.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        <h4 className="text-xs font-bold text-foreground">{LOAD_SECTION.otherTitle}</h4>
        <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground leading-relaxed">
          {LOAD_SECTION.other.map((o, i) => (
            <li key={i}><strong className="text-foreground">{o.lead}</strong> {o.text}</li>
          ))}
        </ul>
      </section>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)}>{trigger}</div>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 shrink-0 text-left">
            <DrawerTitle className="text-left truncate min-w-0">{title}</DrawerTitle>
            <DrawerClose asChild>
              <button type="button" aria-label="Fechar" className="rounded-full p-2 hover:bg-muted transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Explicação de cada fase do ciclo e de como subir a carga.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
