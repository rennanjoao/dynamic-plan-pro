// src/components/student/WhatsNewHost.tsx
// Orquestra o aviso automático de novidades na área do aluno.
//
// - Busca os avisos pendentes (função get_pending_announcements, que já aplica
//   RLS, público, expiração e "já viu").
// - Abre UMA apresentação com os slides de todos os avisos pendentes.
// - Marca como visto ao EXIBIR (mesmo critério do StudentOnboardingCard): nunca
//   repete, mesmo que o aluno feche o app sem tocar em nada. O conteúdo continua
//   disponível em "Novidades" (histórico).
//
// `enabled` deve ser false no Modo Espelho do coach (?previewAs=...): o coach
// não pode consumir o aviso em nome do aluno.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WhatsNewDialog } from "@/components/student/WhatsNewDialog";
import { fetchPendingAnnouncements, markAnnouncementsSeen } from "@/hooks/useWhatsNew";
import { flattenAnnouncements, type WhatsNewSlide } from "@/lib/whatsNew";

export function WhatsNewHost({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<WhatsNewSlide[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    (async () => {
      try {
        const pending = await fetchPendingAnnouncements();
        if (pending.length === 0) return;
        const { slides: flat, ids } = flattenAnnouncements(pending);
        // Marca já na exibição (inclui avisos sem slide válido, pra não voltarem vazios).
        void markAnnouncementsSeen(ids);
        if (flat.length === 0) return;
        setSlides(flat);
        setOpen(true);
      } catch (e) {
        // Recurso opcional: nunca pode atrapalhar o dashboard do aluno.
        console.warn("[whatsNew] não foi possível carregar novidades:", e);
      }
    })();
  }, [enabled]);

  return (
    <WhatsNewDialog
      open={open}
      onOpenChange={setOpen}
      slides={slides}
      onNavigate={(route) => {
        setOpen(false);
        navigate(route);
      }}
    />
  );
}

export default WhatsNewHost;
