/**
 * Barra de publicar do protocolo (auditoria de 21/11/2026).
 *
 * - Largura total da coluna, com fundo próprio: fica presa no rodapé da tela
 *   sem flutuar por cima dos campos (antes o botão cobria o 2º exercício).
 * - UM status (src/lib/publishStatus.ts) no lugar dos avisos repetidos.
 * - "N alterações" abre a lista do que o aluno ainda não vê, com
 *   "Descartar rascunho" no rodapé da lista.
 */
import { AlertCircle, CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProtocolChange } from "@/lib/protocolChangeDetector";
import { describePublishStatus, type PublishStatusInput, type PublishStatusTone } from "@/lib/publishStatus";

const TONE: Record<PublishStatusTone, string> = {
  neutral: "text-muted-foreground",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
};

export function PublishBar({
  status,
  pendingChanges,
  publishLabel,
  publishing,
  onPublish,
  onActivate,
  onDiscardDraft,
}: {
  status: Omit<PublishStatusInput, "pendingCount">;
  pendingChanges: ProtocolChange[];
  publishLabel: { full: string; short: string };
  publishing: boolean;
  onPublish: () => void;
  onActivate: () => void;
  /** Só quando existe rascunho salvo no servidor. */
  onDiscardDraft?: () => void;
}) {
  const st = describePublishStatus({ ...status, pendingCount: pendingChanges.length });
  const Icon = st.kind === "publishing" || st.kind === "saving" ? Loader2
    : st.tone === "emerald" ? CheckCircle2
    : st.tone === "rose" ? XCircle
    : AlertCircle;
  const icon = <Icon className={cn("w-4 h-4 shrink-0", (st.kind === "publishing" || st.kind === "saving") && "animate-spin")} />;
  const hasList = st.kind === "draft" && (pendingChanges.length > 0 || !!onDiscardDraft);

  const text = (
    <span className="min-w-0 line-clamp-2 sm:line-clamp-1 text-left">{st.text}</span>
  );

  return (
    <div
      className="sticky bottom-0 z-40 -mx-4 sm:mx-0 border-t sm:border border-border sm:rounded-t-xl bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 px-4 sm:px-3 py-2.5 shadow-[0_-10px_24px_-16px_rgba(0,0,0,0.6)]"
      data-testid="publish-bar"
    >
      <div className="flex items-center gap-3">
        <div className={cn("flex-1 min-w-0 flex items-center gap-2 text-xs sm:text-[13px] font-medium", TONE[st.tone])} role="status" aria-live="polite" data-testid="publish-status">
          {hasList ? (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="min-w-0 flex items-center gap-2 hover:underline underline-offset-2" title="Ver o que o aluno ainda não vê">
                  {icon}{text}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-[min(92vw,420px)] p-0">
                <p className="px-3 py-2 text-xs font-semibold border-b border-border">
                  {pendingChanges.length > 0 ? "O aluno ainda não vê:" : "Rascunho não publicado"}
                </p>
                {pendingChanges.length > 0 && (
                  <ul className="max-h-60 overflow-y-auto divide-y divide-border">
                    {pendingChanges.slice(0, 30).map((c, i) => (
                      <li key={i} className="px-3 py-2 text-[11px]">
                        <div className="font-medium text-foreground/90">{c.label}</div>
                        {c.detail && <div className="text-muted-foreground mt-0.5">{c.detail}</div>}
                      </li>
                    ))}
                    {pendingChanges.length > 30 && (
                      <li className="px-3 py-2 text-[11px] italic text-muted-foreground">+ {pendingChanges.length - 30} outras alterações…</li>
                    )}
                  </ul>
                )}
                {onDiscardDraft && (
                  <div className="border-t border-border p-2 flex justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onDiscardDraft}>
                      Descartar rascunho
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            <>{icon}{text}</>
          )}
          {st.kind === "inactive" && (
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onActivate} data-testid="publish-bar-activate">
              Ativar
            </Button>
          )}
        </div>
        {/* Não desativa quando "Inativo": o clique explica o motivo (antes nada acontecia). */}
        <Button onClick={onPublish} disabled={publishing} className="shrink-0 shadow-md" data-testid="publish-button">
          {publishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          <span className="hidden sm:inline">{publishLabel.full}</span>
          <span className="sm:hidden">{publishLabel.short}</span>
        </Button>
      </div>
    </div>
  );
}
