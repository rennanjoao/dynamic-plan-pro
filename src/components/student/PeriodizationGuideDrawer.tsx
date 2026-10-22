// Menu "Como ler minha periodização" — mesmo padrão do WorkoutGuideDrawer
// (Drawer no mobile, Dialog no desktop, área rolável com max-h-[85dvh]).
import { useRef, useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { X, TrendingUp, ShieldCheck } from "lucide-react";
import {
  PHASES, PHASE_ORDER, MENU_INTRO, LOAD_SECTION, HERE_BADGE,
  PERIODIZATION_MENU_TITLE, type PhaseKey,
} from "@/lib/periodizationCopy";
import { WorkoutRulesContent } from "@/components/student/WorkoutGuideDrawer";

interface Props {
  trigger: ReactNode;
  currentPhase: PhaseKey | "deload" | null;
}

type GuideTab = "semanas" | "carga" | "regras";

// Linha do tempo do exemplo de progressão (mesmos números do texto do exemplo).
const TIMELINE = [
  { label: "Treino 1", value: "30 kg × 6" },
  { label: "Treino 2", value: "30 kg × 7" },
  { label: "Treino 3", value: "30 kg × 8" },
  { label: "Treino 4", value: "Sobe o peso" },
];

export function PeriodizationGuideDrawer({ trigger, currentPhase }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuideTab>("semanas");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const title = PERIODIZATION_MENU_TITLE;
  const activePhase: PhaseKey | null = currentPhase && currentPhase !== "deload" ? currentPhase : null;

  const changeTab = (v: string) => {
    setTab(v as GuideTab);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setTab("semanas");
  };

  const badge = (
    <span className="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
      {HERE_BADGE}
    </span>
  );

  const phaseDetails = (k: PhaseKey) => {
    const p = PHASES[k];
    return (
      <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
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
      </div>
    );
  };

  const otherPhases = PHASE_ORDER.filter((k) => k !== activePhase);

  const weeksTab = (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">{MENU_INTRO}</p>
      {activePhase && (
        <section className="rounded-lg border border-primary/50 bg-primary/5 p-3 space-y-2">
          <div className="text-sm font-bold flex items-center flex-wrap gap-y-1">
            {PHASES[activePhase].menuTitle}
            {badge}
          </div>
          <div className="text-[11px] text-muted-foreground">{PHASES[activePhase].technicalName}</div>
          {phaseDetails(activePhase)}
          <button
            type="button"
            onClick={() => changeTab("carga")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver como subir a carga ›
          </button>
        </section>
      )}
      <Accordion type="single" collapsible>
        {otherPhases.map((k) => (
          <AccordionItem key={k} value={k}>
            <AccordionTrigger className="text-left">
              <div>
                <div className="text-sm font-bold">{PHASES[k].menuTitle}</div>
                <div className="text-[11px] text-muted-foreground font-normal">{PHASES[k].technicalName}</div>
              </div>
            </AccordionTrigger>
            <AccordionContent>{phaseDetails(k)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );

  const strengthRule = (
    <div className="space-y-3">
      <ol className="list-decimal pl-4 space-y-1 text-xs text-muted-foreground leading-relaxed">
        {LOAD_SECTION.strengthSteps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <ol className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" aria-label="Linha do tempo do exemplo">
        {TIMELINE.map((t, i) => (
          <li
            key={t.label}
            className={`rounded-md border p-2 text-center ${i === TIMELINE.length - 1 ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className="text-xs font-bold text-foreground break-words">{t.value}</div>
          </li>
        ))}
      </ol>
      <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-foreground leading-relaxed">
        {LOAD_SECTION.example}
      </div>
    </div>
  );

  const otherRule = activePhase && activePhase !== "forca"
    ? LOAD_SECTION.other.find((o) => o.lead.toLowerCase().startsWith(PHASES[activePhase].name.toLowerCase()))
    : undefined;

  const loadTab = (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <TrendingUp className="w-4 h-4 text-primary shrink-0" /> {LOAD_SECTION.title}
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{LOAD_SECTION.intro}</p>

      {otherRule ? (
        <>
          <div className="rounded-lg border border-primary/50 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
            <div className="text-sm font-bold text-foreground flex items-center flex-wrap gap-y-1 mb-1">
              {PHASES[activePhase as PhaseKey].menuTitle}
              {badge}
            </div>
            <strong className="text-foreground">{otherRule.lead}</strong> {otherRule.text}
          </div>
          <Accordion type="single" collapsible>
            <AccordionItem value="forca">
              <AccordionTrigger className="text-left text-xs font-bold">{LOAD_SECTION.strengthTitle}</AccordionTrigger>
              <AccordionContent>{strengthRule}</AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      ) : (
        <>
          <h4 className="text-xs font-bold text-foreground">{LOAD_SECTION.strengthTitle}</h4>
          {strengthRule}
        </>
      )}

      <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" /> {LOAD_SECTION.safetyTitle}
      </h4>
      <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground leading-relaxed">
        {LOAD_SECTION.safetyRules.map((s, i) => <li key={i}>{s}</li>)}
      </ul>

      {!otherRule && (
        <>
          <h4 className="text-xs font-bold text-foreground">{LOAD_SECTION.otherTitle}</h4>
          <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground leading-relaxed">
            {LOAD_SECTION.other.map((o, i) => (
              <li key={i}><strong className="text-foreground">{o.lead}</strong> {o.text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  const tabsBar = (
    <TabsList className="grid w-full grid-cols-3">
      <TabsTrigger value="semanas" className="text-xs">Semanas</TabsTrigger>
      <TabsTrigger value="carga" className="text-xs">Subir carga</TabsTrigger>
      <TabsTrigger value="regras" className="text-xs">Regras</TabsTrigger>
    </TabsList>
  );

  const content = (
    <>
      <TabsContent value="semanas" className="mt-0">{weeksTab}</TabsContent>
      <TabsContent value="carga" className="mt-0">{loadTab}</TabsContent>
      <TabsContent value="regras" className="mt-0"><WorkoutRulesContent /></TabsContent>
    </>
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
