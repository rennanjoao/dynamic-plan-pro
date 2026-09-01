// src/components/student/WorkoutGuideDrawer.tsx
// Guia rápido "Como ler o seu treino", acionado por um botão discreto no
// topo da tela de rotina de treinos (WorkoutPlan.tsx). Autocontido (dono do
// próprio estado de abertura), como TpmCravingsDialog/FoodmapsDialog.
//
// Segue o padrão responsivo já estabelecido em ExerciseVideoSheet.tsx /
// MobilitySuggestedDrawer.tsx (Drawer no mobile, Dialog no desktop) — não
// introduz um terceiro tipo de overlay pra esse tipo de conteúdo.
//
// max-h-[85dvh] (não vh) + overflow-y-auto nativo numa área interna: mesmo
// fix já validado no TpmCravingsDialog para conteúdo mais alto que a tela em
// mobile (vh não desconta a barra de endereço do navegador; dvh desconta).
// Nem ExerciseVideoSheet.tsx nem MobilitySuggestedDrawer.tsx têm esse fix
// ainda — o conteúdo deles cabe sem rolar. Este guia é mais longo, então
// aplica o fix por cima do padrão, em vez de herdar o bug junto com ele.

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { BookOpenText, Flame, Layers, Target, RotateCcw, X, AlertTriangle } from "lucide-react";

interface WorkoutGuideDrawerProps {
  /** Substitui o botão-gatilho padrão (ex: pra usar um ícone em vez do texto). */
  trigger?: ReactNode;
  className?: string;
}

export function WorkoutGuideDrawer({ trigger, className }: WorkoutGuideDrawerProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const title = "Guia Rápido: Como ler o seu treino";

  const body = (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Para extrair o máximo de resultado sem se machucar, siga estas 4 regras de ouro na sua rotina:
      </p>

      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Flame className="w-4 h-4 text-primary shrink-0" />
          1. O Primeiro Aquecimento (A "Série Zero")
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          A sua <strong className="text-foreground">primeira série</strong> do{" "}
          <strong className="text-foreground">primeiro exercício</strong> do dia deve ser sempre feita apenas com a
          barra ou um peso muito leve (5 a 10kg). O objetivo aqui é apenas lubrificar as articulações e avisar seu
          corpo que o treino começou.
        </p>
        <Callout>Esse aquecimento não conta nas séries escritas na sua ficha! Ele é feito totalmente por fora.</Callout>
      </section>

      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Layers className="w-4 h-4 text-primary shrink-0" />
          2. A Regra do "2+2" (Preparação + Valendo)
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Se você vir marcações como <strong className="text-foreground">"2+2"</strong> ou{" "}
          <strong className="text-foreground">"1+3"</strong> no campo de séries, nem todas são pra matar. Exemplo de
          um 2+2 (lembrando que você já fez a sua Série Zero de 5kg antes disso):
        </p>
        <ul className="text-xs text-muted-foreground rounded-md border border-border/50 bg-muted/20 divide-y divide-border/50 overflow-hidden">
          <li className="p-2">
            <span className="font-bold text-foreground">Série 1 (Aquecimento):</span> 30% a 40% da carga máxima que você aguenta.
          </li>
          <li className="p-2">
            <span className="font-bold text-foreground">Série 2 (Reconhecimento):</span> 50% a 70% da carga, pra sentir o peso.
          </li>
          <li className="p-2">
            <span className="font-bold text-foreground">Séries 3 e 4 (Hard Sets):</span> carga máxima para a faixa de repetições pedida. Aqui é para valer!
          </li>
        </ul>
      </section>

      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Target className="w-4 h-4 text-primary shrink-0" />
          3. O que é "Ir até a Falha"?
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Falhar não é desmaiar ou quebrar o equipamento. Buscamos a <strong className="text-foreground">Falha
          Técnica</strong>: a série acaba no exato momento em que você não consegue mais fazer o movimento com a
          postura perfeita. Começou a "roubar" ou entortar o corpo? O exercício acabou.
        </p>
      </section>

      <section className="space-y-1.5">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <RotateCcw className="w-4 h-4 text-primary shrink-0" />
          4. Faltou no treino? O que fazer
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Percebeu que não vai conseguir treinar hoje? Sem desespero. Faça desse um dia de descanso total ou, no
          máximo, um aeróbico de baixa intensidade. No dia seguinte, simplesmente retome a rotina fazendo o treino
          que você faltou — não pule treinos!
        </p>
        <Callout>Faça a dieta correspondente ao "Dia de Descanso".</Callout>
      </section>
    </div>
  );

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

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)}>{trigger ?? defaultTrigger}</div>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 shrink-0 text-left">
            <DrawerTitle className="text-left truncate min-w-0">{title}</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Fechar guia"
                className="rounded-full p-2 hover:bg-black/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-6"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)}>{trigger ?? defaultTrigger}</div>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Guia rápido com as regras de aquecimento, séries de preparação, falha técnica e o que fazer ao faltar um treino.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-600 leading-relaxed">
        <strong className="uppercase tracking-wide text-[10px] block mb-0.5">Atenção</strong>
        {children}
      </p>
    </div>
  );
}
