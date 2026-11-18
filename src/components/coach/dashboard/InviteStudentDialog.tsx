/**
 * InviteStudentDialog — "+ Convidar aluno" direto na lista de alunos.
 *
 * Antes o convite ficava escondido em Perfil → aba "Geração de código", e a
 * lista vazia só dizia "compartilhe seu código" sem mostrar código nenhum.
 * Aqui: gera um código de aluno (mesma função generate-access-code), monta o
 * link que já abre o cadastro com o código preenchido e a mensagem pronta para
 * copiar ou mandar no WhatsApp.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { buildInviteLink, buildInviteMessage, normalizeWhatsapp } from "@/lib/inviteMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function InviteStudentDialog({
  open, onOpenChange, coachId, coachName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachId: string;
  coachName?: string;
}) {
  const qc = useQueryClient();
  const [studentName, setStudentName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const reset = () => { setStudentName(""); setPhone(""); setCode(null); };

  const generate = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("generate-access-code", {
      body: { kind: "student", partnerId: null, commission_bp: null, note: studentName.trim() || null },
    });
    setBusy(false);
    const generated = (data as { accessCode?: { code?: string } } | null)?.accessCode?.code;
    if (error || !generated) {
      toast.error("Não foi possível gerar o convite agora. Tente de novo.");
      return;
    }
    setCode(generated);
    qc.invalidateQueries({ queryKey: queryKeys.coachAccessCodes(coachId) });
  };

  const link = code ? buildInviteLink(window.location.origin, code) : "";
  const message = code ? buildInviteMessage({ studentName, coachName, link, code }) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada — é só colar para o aluno.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const whatsapp = () => {
    const num = normalizeWhatsapp(phone);
    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Convidar aluno</DialogTitle>
          <DialogDescription>
            Gera um código só para este aluno e a mensagem pronta para enviar.
          </DialogDescription>
        </DialogHeader>

        {!code ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nome do aluno (opcional)</Label>
              <Input id="invite-name" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Ex.: Maria Silva" />
              <p className="text-xs text-muted-foreground">Fica anotado no código para você saber de quem é.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-phone">WhatsApp do aluno (opcional)</Label>
              <Input id="invite-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 91234-5678" />
            </div>
            <Button className="w-full" size="lg" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Gerar convite
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Código do aluno</p>
              <p className="text-2xl font-black tracking-widest text-primary" data-testid="invite-code">{code}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <textarea
                readOnly
                value={message}
                className="w-full min-h-[150px] rounded-md border border-input bg-background p-2 text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copy}><Copy className="w-4 h-4 mr-2" /> Copiar</Button>
              <Button onClick={whatsapp} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={reset}>Convidar outro aluno</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default InviteStudentDialog;
