/**
 * Histórico único do protocolo (auditoria de 21/11/2026, Pacote B).
 *
 * Antes eram dois botões em lugares diferentes — "Alterações" no topo e
 * "Histórico de versões" dentro do menu Mais — para duas faces da mesma
 * pergunta ("o que mudou neste protocolo?"). Agora é um botão "Histórico"
 * com duas abas:
 *  - Alterações enviadas: o resumo que o aluno recebeu a cada publicação
 *    e se ele já viu (somente leitura);
 *  - Versões publicadas: cada publicação guardada, com "Restaurar" (carrega
 *    para edição; nada vai para o aluno sem "Publicar").
 */
import { useState } from "react";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Private } from "@/components/coach/PrivacyMode";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import { ChangeHistoryList } from "./ProtocolChangeHistoryDialog";
import { VersionHistoryList } from "./ProtocolVersionHistoryDialog";

export default function ProtocolHistoryDialog({
  open, onOpenChange, studentId, studentName, protocolId, onRestore,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName: string;
  protocolId: string | null;
  onRestore: (payload: ProtocolPayload) => void;
}) {
  const [tab, setTab] = useState<"changes" | "versions">("changes");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico — <Private>{studentName || "Aluno"}</Private>
          </DialogTitle>
          <DialogDescription className="text-xs">
            O que o aluno recebeu a cada publicação e as versões guardadas. Restaurar só carrega para edição.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="changes" data-testid="history-tab-changes">Alterações enviadas</TabsTrigger>
            <TabsTrigger value="versions" data-testid="history-tab-versions">Versões publicadas</TabsTrigger>
          </TabsList>
          <TabsContent value="changes" className="mt-3">
            <ChangeHistoryList studentId={studentId} enabled={open && tab === "changes"} />
          </TabsContent>
          <TabsContent value="versions" className="mt-3">
            <VersionHistoryList
              protocolId={protocolId}
              enabled={open && tab === "versions"}
              onRestore={onRestore}
              onRestored={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
