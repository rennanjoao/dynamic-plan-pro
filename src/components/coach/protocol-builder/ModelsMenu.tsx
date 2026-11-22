/**
 * Botão "Modelos ▾" — o MESMO botão, no mesmo canto (alto, à direita) de
 * cada aba do protocolo (auditoria de 21/11/2026, Pacote B). Antes os
 * modelos estavam espalhados em ~10 botões com 4 nomes (modelo, template,
 * bloco, biblioteca): "Aplicar dieta", "Salvar dieta", "Carregar modelo",
 * "biblioteca completa", "Aplicar/Salvar diretrizes"…
 *
 * Cada aba passa as suas seções (ex.: Dieta inteira / Uma refeição) e o
 * rodapé abre a biblioteca com tudo.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, LayoutTemplate, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ModelsMenuSection {
  title: string;
  /** Conteúdo da seção; a função recebe `close` para fechar o menu antes de abrir um diálogo. */
  content: ReactNode | ((close: () => void) => ReactNode);
}

export function ModelsMenu({
  sections,
  onOpenLibrary,
  testId = "models-menu",
}: {
  sections: ModelsMenuSection[];
  onOpenLibrary?: () => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" data-testid={testId}>
          <LayoutTemplate className="w-3.5 h-3.5" /> Modelos <ChevronDown className="w-3 h-3 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3 space-y-3">
        {sections.map((s) => (
          <div key={s.title} className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{s.title}</p>
            {typeof s.content === "function" ? s.content(close) : s.content}
          </div>
        ))}
        {onOpenLibrary && (
          <button
            type="button"
            onClick={() => { close(); onOpenLibrary(); }}
            className="w-full flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5 text-xs hover:bg-muted"
            data-testid={`${testId}-library`}
          >
            <Library className="w-3.5 h-3.5" /> Biblioteca de modelos (treinos, dietas e protocolos)
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
