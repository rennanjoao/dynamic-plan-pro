import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { STATUS_DOT, STATUS_PILL } from "./dashboardUtils";

/**
 * Legenda dos selos da lista de alunos. Antes a explicação só aparecia ao
 * passar o mouse (no celular nunca aparecia). Aqui abre com um toque.
 */
export function BadgeLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground" data-testid="badge-legend">
          <HelpCircle className="w-4 h-4" /> <span className="hidden sm:inline">O que é cada selo?</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-xs space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Responder</p>
          <p className="text-muted-foreground">
            O aluno mandou check-in e <strong>você</strong> ainda não respondeu. Toque para abrir direto o check-in.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Em dia · Atenção · Crítico</p>
          <div className="flex gap-1.5">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${STATUS_PILL.ok}`}>Em dia</span>
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${STATUS_PILL.warning}`}>Atenção</span>
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${STATUS_PILL.critical}`}>Crítico</span>
          </div>
          <p className="text-muted-foreground">
            Mede só o <strong>atraso do aluno</strong> em enviar o check-in, pelo prazo configurado para ele.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Bem · Observar · Sinal ruim</p>
          <div className="flex gap-3">
            <span className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT.ok}`} />Bem</span>
            <span className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT.warning}`} />Observar</span>
            <span className="inline-flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT.critical}`} />Sinal ruim</span>
          </div>
          <p className="text-muted-foreground">
            O que o <strong>último check-in diz</strong>: dieta, faltas no treino, sono, humor, compulsão e aparência.
            "Sinal ruim" = pediu atenção urgente ou deu várias respostas no pior nível.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Radar 🟢 🟡 🔴</p>
          <p className="text-muted-foreground">
            Leitura automática da evolução (medidas, treino e check-ins juntos). 🔴 = vale intervir.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default BadgeLegend;
