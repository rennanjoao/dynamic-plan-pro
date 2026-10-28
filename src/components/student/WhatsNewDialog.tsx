// src/components/student/WhatsNewDialog.tsx
// Apresentação curta de novidades da plataforma (1 a 8 slides).
//
// Segue o padrão responsivo do projeto (WorkoutGuideDrawer/ExerciseVideoSheet):
// Drawer no mobile, Dialog no desktop, com max-h-[85dvh] (não vh) + área
// interna com overflow-y-auto nativo — mesmo fix já validado no S.O.S TPM.
//
// É um componente controlado e "burro": não busca nem grava nada. Quem decide
// quando abrir e o que marcar como visto é o WhatsNewHost / o histórico.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveIcon, sanitizeRoute, type WhatsNewSlide } from "@/lib/whatsNew";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: WhatsNewSlide[];
  /** Chamado ao tocar no botão do slide (ex.: "Ver agora"). Recebe rota interna já validada. */
  onNavigate?: (route: string) => void;
}

function WhatsNewBody({
  slides,
  onClose,
  onNavigate,
}: {
  slides: WhatsNewSlide[];
  onClose: () => void;
  onNavigate?: (route: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const slide = slides[index];
  const isLast = index === slides.length - 1;
  const Icon = resolveIcon(slide.icon);
  const ctaRoute = sanitizeRoute(slide.cta?.route);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={reduceMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col items-center text-center gap-4 pt-2"
            aria-live="polite"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="w-8 h-8" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold leading-snug">{slide.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{slide.body}</p>
            {ctaRoute && slide.cta && onNavigate && (
              <Button variant="outline" size="sm" onClick={() => onNavigate(ctaRoute)}>
                {slide.cta.label}
              </Button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-border/60 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        {slides.length > 1 && (
          <div className="flex items-center justify-center gap-1.5" role="presentation">
            {slides.map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
            <span className="sr-only">
              Novidade {index + 1} de {slides.length}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          {index > 0 && (
            <Button variant="ghost" className="flex-1" onClick={() => setIndex((i) => i - 1)}>
              Voltar
            </Button>
          )}
          <Button className="flex-1" onClick={() => (isLast ? onClose() : setIndex((i) => i + 1))}>
            {isLast ? "Entendi" : "Próximo"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WhatsNewDialog({ open, onOpenChange, slides, onNavigate }: WhatsNewDialogProps) {
  const isMobile = useIsMobile();
  if (slides.length === 0) return null;

  const close = () => onOpenChange(false);
  const title = "O que há de novo";
  const description = "Novidades da plataforma, explicadas rapidamente.";

  const badge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-semibold">
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      Novidade
    </span>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="shrink-0 items-center text-center gap-1.5">
            {badge}
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{description}</DrawerDescription>
          </DrawerHeader>
          <WhatsNewBody slides={slides} onClose={close} onNavigate={onNavigate} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 items-center text-center space-y-1.5 px-6 pt-6 pb-2">
          {badge}
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <WhatsNewBody slides={slides} onClose={close} onNavigate={onNavigate} />
      </DialogContent>
    </Dialog>
  );
}

export default WhatsNewDialog;
