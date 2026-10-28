// src/components/student/WhatsNewHistoryLink.tsx
// Link discreto "Novidades do app": lista os avisos já publicados e reabre
// qualquer um deles. Não marca nada como visto (é só leitura).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsNewDialog } from "@/components/student/WhatsNewDialog";
import { useAnnouncementHistory } from "@/hooks/useWhatsNew";
import { normalizeSlides, type WhatsNewSlide } from "@/lib/whatsNew";
import { formatDatePtBR } from "@/lib/formatDate";

export function WhatsNewHistoryLink({ enabled = true }: { enabled?: boolean }) {
  const navigate = useNavigate();
  const [listOpen, setListOpen] = useState(false);
  const [slides, setSlides] = useState<WhatsNewSlide[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Só consulta quando o aluno abre a lista.
  const { data, isLoading } = useAnnouncementHistory(enabled && listOpen);
  const items = (data ?? []).filter((a) => normalizeSlides(a.slides).length > 0);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setListOpen(true)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="w-3 h-3" aria-hidden="true" />
        Novidades do app
      </button>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Novidades do app</DialogTitle>
            <DialogDescription>Tudo o que mudou na plataforma, do mais recente ao mais antigo.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 -mx-1 px-1 space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>}
            {!isLoading && items.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Ainda não há novidades publicadas.</p>
            )}
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSlides(normalizeSlides(a.slides));
                  setListOpen(false);
                  setViewerOpen(true);
                }}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-left hover:border-primary/40 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{a.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{formatDatePtBR(a.published_at)}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <WhatsNewDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        slides={slides}
        onNavigate={(route) => {
          setViewerOpen(false);
          navigate(route);
        }}
      />
    </>
  );
}

export default WhatsNewHistoryLink;
