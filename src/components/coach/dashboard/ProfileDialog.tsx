import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChangePasswordButton } from "@/components/ChangePasswordButton";
import { sb } from "./dashboardUtils";

export function ProfileDialog({ coachId, open, onClose }: { coachId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [supportWhatsapp, setSupportWhatsapp] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixHolderName, setPixHolderName] = useState("");
  const [pixCity, setPixCity] = useState("");
  const [billingAlertDays, setBillingAlertDays] = useState<number>(7);
  const [feedbackIntervalDays, setFeedbackIntervalDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || !coachId) return;
    supabase
      .from("profiles")
      .select("full_name, team_name, invite_code, notification_email, support_whatsapp, pix_key, pix_holder_name, pix_city, billing_alert_days, feedback_interval_days")
      .eq("user_id", coachId)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name || "");
        setTeamName((data as any)?.team_name || "");
        setInviteCode((data as any)?.invite_code || "");
        setNotificationEmail((data as any)?.notification_email || "");
        setSupportWhatsapp((data as any)?.support_whatsapp || "");
        setPixKey((data as any)?.pix_key || "");
        setPixHolderName((data as any)?.pix_holder_name || "");
        setPixCity((data as any)?.pix_city || "");
        setBillingAlertDays((data as any)?.billing_alert_days ?? 7);
        setFeedbackIntervalDays((data as any)?.feedback_interval_days ?? 7);
      });
  }, [open, coachId]);

  const generatingRef = useRef(false);
  const generateCode = async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let attempt = 0; attempt < 6; attempt++) {
        let code = "";
        for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        const { data: exists } = await supabase.from("profiles").select("user_id").eq("invite_code", code).maybeSingle();
        if (!exists) { setInviteCode(code); toast.success("Código gerado. Lembre de salvar."); return; }
      }
      toast.error("Não foi possível gerar um código único.");
    } catch (e: any) { toast.error(e.message); } finally { generatingRef.current = false; setGenerating(false); }
  };

  const copyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    toast.success("Código copiado");
  };

  const loadingRef = useRef(false);
  const save = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const code = inviteCode.trim().toUpperCase() || null;
      if (code) {
        const { data: clash } = await supabase.from("profiles").select("user_id").eq("invite_code", code).neq("user_id", coachId).maybeSingle();
        if (clash) { toast.error("Este código já está em uso por outro coach."); return; }
      }
      const { error } = await sb.from("profiles").update({
        full_name: fullName,
        team_name: teamName,
        invite_code: code,
        notification_email: notificationEmail.trim() || null,
        support_whatsapp: supportWhatsapp.replace(/\D/g, "") || null,
        pix_key: pixKey,
        pix_holder_name: pixHolderName || null,
        pix_city: pixCity || null,
        billing_alert_days: billingAlertDays,
        feedback_interval_days: feedbackIntervalDays,
      }).eq("user_id", coachId);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["coach-profile", coachId] });
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("coach-students") });
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { loadingRef.current = false; setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle>Meu Perfil</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Nome da equipe / empresa</Label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ex: Equipe Performance" className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">E-mail de notificação</Label>
            <Input type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} placeholder="Para onde os alunos te contatam" className="mt-1 h-9 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-1">Visível para os alunos como seu contato.</p>
          </div>

          <div>
            <Label className="text-xs text-emerald-600 font-bold">WhatsApp para dúvidas</Label>
            <Input
              value={supportWhatsapp}
              onChange={(e) => setSupportWhatsapp(e.target.value)}
              placeholder="Ex: 13991842023 (DDD + número)"
              className="mt-1 h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Se preenchido, o aluno vê um botão de WhatsApp que fala direto com você. Em branco, o botão não aparece.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-amber-600 font-bold">Chave PIX</Label>
              <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Email, CPF..." className="mt-1 h-9 text-sm border-amber-500/30" />
            </div>
            <div>
              <Label className="text-xs text-primary font-bold">Aviso de cobrança</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min={1} max={30} value={billingAlertDays}
                  onChange={(e) => setBillingAlertDays(Number(e.target.value) || 7)}
                  className="h-9 text-sm w-16 text-center" />
                <span className="text-xs text-muted-foreground">dias antes</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome do recebedor (PIX)</Label>
              <Input value={pixHolderName} onChange={(e) => setPixHolderName(e.target.value.slice(0, 25))} placeholder="Como aparece no banco" maxLength={25} className="mt-1 h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">Até 25 caracteres. Usado no QR Code.</p>
            </div>
            <div>
              <Label className="text-xs">Cidade (PIX)</Label>
              <Input value={pixCity} onChange={(e) => setPixCity(e.target.value.slice(0, 15))} placeholder="Ex: SAO PAULO" maxLength={15} className="mt-1 h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">Até 15 caracteres.</p>
            </div>
          </div>

          

          <div>
            <Label className="text-xs text-emerald-600 font-bold">Intervalo de feedback</Label>
            <p className="text-[11px] text-muted-foreground mb-1">A cada quantos dias você quer receber feedback dos alunos?</p>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={60} value={feedbackIntervalDays}
                onChange={(e) => setFeedbackIntervalDays(Number(e.target.value) || 7)}
                className="h-9 text-sm w-16 text-center" />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
            <Label className="text-xs text-primary uppercase tracking-wider">Código de convite</Label>
            <p className="text-[11px] text-muted-foreground">Compartilhe com seus alunos.</p>
            <div className="flex gap-2">
              <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="EX: ELITE26" maxLength={12} className="h-9 text-sm font-mono tracking-widest uppercase" />
              <Button type="button" variant="outline" size="sm" onClick={generateCode} disabled={generating}>{generating ? "..." : "Gerar"}</Button>
              <Button type="button" variant="outline" size="sm" onClick={copyCode} disabled={!inviteCode}>Copiar</Button>
            </div>
          </div>

          <Button onClick={save} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar Perfil"}
          </Button>

          <div className="border-t border-border pt-3">
            <ChangePasswordButton variant="outline" className="w-full" />
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Enviaremos um link de redefinição para seu e-mail.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProfileDialog;