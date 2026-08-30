import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Heart, Flame, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CRAVING_OPTIONS = [
  // --- DOCES CLÁSSICOS E FRUTAS ---
  {
    title: "Morango com Leite Moça",
    description: "100g a 150g de morango fresco picado + 20g a 25g de leite condensado por cima.",
    macros: "~130 kcal",
    icon: "🍓",
  },
  {
    title: "Doce de Leite Puro",
    description: "1 colher de sopa (aprox. 30g) do seu doce de leite preferido. Coma devagar.",
    macros: "~95 kcal",
    icon: "🥄",
  },
  {
    title: "Doces Tradicionais",
    description: "1 unidade pequena (30g) de Doce de Abóbora, Doce de Batata OU Doce de Mocotó.",
    macros: "~100 kcal",
    icon: "🍬",
  },
  {
    title: "Iogurte com Morango e Canela",
    description: "1 iogurte natural ou grego (zero/light) + morangos picados + canela a gosto.",
    macros: "~110 kcal",
    icon: "🥣",
  },
  {
    title: "Sorvete Natural de Frutas",
    description: "Congela 1 banana + 200g de morango. Bate no processador/liquidificador até dar consistência. Adoce se necessário.",
    macros: "~160 kcal",
    icon: "🍧",
  },
  {
    title: "Tâmara ou Ameixa Seca",
    description: "3 tâmaras médias ou 4 ameixas secas. Textura densa e muito doce.",
    macros: "~140 kcal",
    icon: "🏺",
  },
  {
    title: "1 Barra de Snickers",
    description: "1 barra tradicional (45g). Se a vontade for muito específica de chocolate, coma sem culpa!",
    macros: "~215 kcal",
    icon: "🍫",
  },
  
  // --- SNACKS E CROCANTES ---
  {
    title: "Biscoito de Arroz com Cobertura",
    description: "3 biscoitos de arroz grandes + 15g a 20g de geleia, doce de leite OU requeijão light.",
    macros: "~140 kcal",
    icon: "🍘",
  },
  {
    title: "Biscoito de Polvilho",
    description: "30g de biscoito de polvilho assado (aprox. 15 a 20 biscoitinhos). Muito volume para mastigar.",
    macros: "~120 kcal",
    icon: "🥨",
  },
  {
    title: "Batata na Airfryer",
    description: "150g de batata inglesa em cubos. Tempere (páprica defumada, sal, alho em pó). Frite na Airfryer a 200°C por 15 a 20 min.",
    macros: "~120 kcal",
    icon: "🍟",
  },
  {
    title: "Pipoca Zero Óleo",
    description: "30g de milho de pipoca estourado na panela sem óleo ou no micro-ondas.",
    macros: "~105 kcal",
    icon: "🍿",
  }
];

export function TpmCravingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-white/10 rounded-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
        
        <DialogHeader className="p-6 pb-4 border-b border-white/5 bg-pink-500/10 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase text-pink-500">
            <Heart className="w-5 h-5 fill-pink-500" /> Válvula de Escape
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 pt-1.5">
            Bateu a vontade incontrolável de comer algo diferente (TPM, ansiedade)? Escolha UMA dessas opções. Elas têm <strong>baixa caloria</strong> e vão te salvar sem estragar os resultados.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {CRAVING_OPTIONS.map((opt, i) => (
              <Card key={i} className="bg-white/5 border-white/10 p-3 hover:border-pink-500/30 transition-colors">
                <div className="flex gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-xl bg-pink-500/10 flex items-center justify-center text-2xl">
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm text-zinc-100 leading-tight">{opt.title}</h3>
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Flame className="w-3 h-3" /> {opt.macros}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 bg-red-500/10 border-t border-red-500/20 shrink-0">
          <div className="flex items-start gap-2.5 text-xs text-red-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
            <p>
              <strong className="text-red-400 uppercase tracking-wider text-[10px] block mb-0.5">O que evitar nesses momentos:</strong>
              Fuja de <strong>amendoim/pastas</strong>, <strong>frituras</strong> e <strong>ultraprocessados</strong>. É muito fácil perder o controle calórico com eles. Prefira sempre a lista acima!
            </p>
          </div>
        </div>
        
      </DialogContent>
    </Dialog>
  );
}
