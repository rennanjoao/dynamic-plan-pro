import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChangePasswordButton } from "@/components/ChangePasswordButton";
import { useConfirm } from "@/components/ConfirmProvider";
import { useProfileRecord } from "@/hooks/useProfileRecord";
import type { PlatformCharge } from "@/hooks/usePlatformBilling";

interface CoachProfileRow {
  full_name: string | null;
  team_name: string | null;
  invite_code: string | null;
  notification_email: string | null;
  support_whatsapp: string | null;
  pix_key: string | null;
  pix_holder_name: string | null;
  pix_city: string | null;
  billing_alert_days: number | null;
  feedback_interval_days: number | null;
}

const PROFILE_COLUMNS =
  "full_name, team_name, invite_code, notification_email, support_whatsapp, pix_key, pix_holder_name, pix_city, billing_alert_days, feedback_interval_days";

const AMBIGUOUS_CHARS_RE = /[01OI]/;
const FULL_NAME_MAX_LENGTH = 80;
const TEAM_NAME_MAX_LENGTH = 80;
const NOTIFICATION_EMAIL_MAX_LENGTH = 100;
const PIX_KEY_MAX_LENGTH = 140;

interface ProfileDialogProps {
  coachId: string;
  open: boolean;
  onClose: () => void;
  /** Status da assinatura da plataforma (para mostrar o aviso no próprio Perfil, não só o ponto no botão). */
  platformStatus?: "blocked" | "pending" | null;
  platformCharges?: PlatformCharge[];
  /** Chamado quando o coach clica em "Ver na aba Financeiro" no aviso de cobrança. */
  onOpenFinances?: () => void;
}

export function ProfileDialog({
  coachId,
  open,
  onClose,
  platformStatus = null,
  platformCharges = [],
  onOpenFinances,
}: ProfileDialogProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, loading: fetching, error: fetchError, refetch } =
    useProfileRecord<CoachProfileRow>(coachId, open, PROFILE_COLUMNS);

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
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const hasLoadedRef = useRef(false);
  const snapshotRef = useRef<string>("");

  const buildSnapshot = () =>
    JSON.stringify({
      fullName, teamName, inviteCode, notificationEmail, supportWhatsapp,
      pixKey, pixHolderName, pixCity, billingAlertDays, feedbackIntervalDays,
    });

  // Popula o formulário quando a busca termina com sucesso, e guarda uma
  // "foto" dos valores carregados para detectar alterações não salvas.
  useEffect(() => {
    if (!data) return;
    setFullName(data.full_name || "");
    setTeamName(data.team_name || "");
    setInviteCode(data.invite_code || "");
    setNotificationEmail(data.notification_email || "");
    setSupportWhatsapp(data.support_whatsapp || "");
    setPixKey(data.pix_key || "");
    setPixHolderName(data.pix_holder_name || "");
    setPixCity(data.pix_city || "");
    setBillingAlertDays(data.billing_alert_days ?? 7);
    setFeedbackIntervalDays(data.feedback_interval_days ?? 7);
    hasLoadedRef.current = true;
    // snapshot usa os dados crus de `data` diretamente (não os states acima)
    // para não depender do timing de commit do React.
    snapshotRef.current = JSON.stringify({
      fullName: data.full_name || "",
      teamName: data.team_name || "",
      inviteCode: data.invite_code || "",
      notificationEmail: data.notification_email || "",
      supportWhatsapp: data.support_whatsapp || "",
      pixKey: data.pix_key || "",
      pixHolderName: data.pix_holder_name || "",
      pixCity: data.pix_city || "",
      billingAlertDays: data.billing_alert_days ?? 7,
      feedbackIntervalDays: data.feedback_interval_days ?? 7,
    });
  }, [data]);

  // Cada reabertura começa "limpa" — evita comparar com o snapshot de uma
  // sessão anterior antes do novo fetch responder.
  useEffect(() => {
    if (!open) hasLoadedRef.current = false;
  }, [open]);

  const isDirty = () => hasLoadedRef.current && buildSnapshot() !== snapshotRef.current;

  const requestClose = async () => {
    if (isDirty()) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Você tem alterações não salvas neste perfil. Se sair agora, elas serão perdidas.",
        confirmLabel: "Descartar",
        cancelLabel: "Continuar editando",
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

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
        const { data: exists, error: checkError } = await supabase
          .from("profiles").select("user_id").eq("invite_code", code).maybeSingle();
        if (checkError) throw checkError;
        if (!exists) { setInviteCode(code); toast.success("Código gerado. Lembre de salvar."); return; }
      }
      toast.error("Não foi possível gerar um código único. Tente novamente.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar código.");
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const copyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    toast.success("Código copiado");
  };

  const trimmedName = fullName.trim();
  const whatsappDigits = supportWhatsapp.replace(/\D/g, "");
  const whatsappError =
    whatsappDigits && (whatsappDigits.length < 10 || whatsappDigits.length > 11)
      ? "Informe DDD + número (10 ou 11 dígitos), ou deixe em branco."
      : null;
  const inviteCodeHasAmbiguousChars = inviteCode.length > 0 && AMBIGUOUS_CHARS_RE.test(inviteCode);
  const canSave = !saving && trimmedName.length > 0 && !whatsappError;

  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current) return;
    if (!trimmedName) {
      toast.error("Informe seu nome completo.");
      return;
    }
    if (whatsappError) {
      toast.error(whatsappError);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const code = inviteCode.trim().toUpperCase() || null;
      if (code) {
        const { data: clash, error: clashError } = await supabase
          .from("profiles").select("user_id").eq("invite_code", code).neq("user_id", coachId).maybeSingle();
        if (clashError) throw clashError;
        if (clash) { toast.error("Este código já está em uso por outro coach."); return; }
      }
      const payload = {
        full_name: trimmedName,
        team_name: teamName.trim() || null,
        invite_code: code,
        notification_email: notificationEmail.trim() || null,
        support_whatsapp: whatsappDigits || null,
        pix_key: pixKey.trim() || null,
        pix_holder_name: pixHolderName.trim() || null,
        pix_city: pixCity.trim() || null,
        billing_alert_days: billingAlertDays,
        feedback_interval_days: feedbackIntervalDays,
      };
      const { error } = await supabase.from("profiles").update(payload).eq("user_id", coachId);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      snapshotRef.current = JSON.stringify({
        fullName: trimmedName, teamName: payload.team_name || "", inviteCode: code || "",
        notificationEmail: payload.notification_email || "", supportWhatsapp: whatsappDigits,
        pixKey: payload.pix_key || "", pixHolderName: payload.pix_holder_name || "",
        pixCity: payload.pix_city || "", billingAlertDays, feedbackIntervalDays,
      });
      qc.invalidateQueries({ queryKey: ["coach-profile", coachId] });
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("coach-students") });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar perfil.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription className="sr-only">
            Edite os dados do seu perfil, PIX, código de convite e preferências de aviso.
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : fetchError ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-destructive">Não foi possível carregar seu perfil.</p>
            <p className="text-xs text-muted-foreground">{fetchError}</p>
            <Button type="button" variant="outline" size="sm" onClick={refetch}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {platformStatus && (
              <div
                className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
                  platformStatus === "blocked"
                    ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
                    : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">
                    {platformStatus === "blocked" ? "Assinatura da plataforma bloqueada" : "Assinatura da plataforma pendente"}
                  </p>
                  {platformCharges.length > 0 && (
                    <p className="text-[11px] mt-0.5 opacity-90">
                      {platformCharges.map((c) => `${c.period} — R$ ${Number(c.amount).toFixed(2)}`).join(" · ")}
                    </p>
                  )}
                  {onOpenFinances && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 mt-1 text-[11px] underline"
                      onClick={() => { onOpenFinances(); onClose(); }}
                    >
                      Ver detalhes na aba Financeiro
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Nome completo</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={FULL_NAME_MAX_LENGTH}
                className="mt-1 h-9 text-sm"
              />
              {!trimmedName && (
                <p className="text-[10px] text-destructive mt-1">O nome não pode ficar em branco.</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Nome da equipe / empresa</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Ex: Equipe Performance"
                maxLength={TEAM_NAME_MAX_LENGTH}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">E-mail de notificação</Label>
              <Input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="Para onde os alunos te contatam"
                maxLength={NOTIFICATION_EMAIL_MAX_LENGTH}
                className="mt-1 h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Visível para os alunos como seu contato.</p>
            </div>

            <div>
              <Label className="text-xs text-emerald-600 font-bold">WhatsApp para dúvidas</Label>
              <Input
                value={supportWhatsapp}
                onChange={(e) => setSupportWhatsapp(e.target.value)}
                placeholder="Ex: 13991842023 (DDD + número)"
                maxLength={20}
                className="mt-1 h-9 text-sm"
              />
              {whatsappError ? (
                <p className="text-[10px] text-destructive mt-1">{whatsappError}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se preenchido, o aluno vê um botão de WhatsApp que fala direto com você. Em branco, o botão não aparece.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-amber-600 font-bold">Chave PIX</Label>
                <Input
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Email, CPF..."
                  maxLength={PIX_KEY_MAX_LENGTH}
                  className="mt-1 h-9 text-sm border-amber-500/30"
                />
              </div>
              <div>
                <Label className="text-xs text-primary font-bold">Aviso de cobrança</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number" min={1} max={30} value={billingAlertDays}
                    onChange={(e) => setBillingAlertDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))}
                    className="h-9 text-sm w-16 text-center"
                  />
                  <span className="text-xs text-muted-foreground">dias antes</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome do recebedor (PIX)</Label>
                <Input
                  value={pixHolderName}
                  onChange={(e) => setPixHolderName(e.target.value.slice(0, 25))}
                  placeholder="Como aparece no banco"
                  maxLength={25}
                  className="mt-1 h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Até 25 caracteres. Usado no QR Code.</p>
              </div>
              <div>
                <Label className="text-xs">Cidade (PIX)</Label>
                <Input
                  value={pixCity}
                  onChange={(e) => setPixCity(e.target.value.slice(0, 15))}
                  placeholder="Ex: SAO PAULO"
                  maxLength={15}
                  className="mt-1 h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Até 15 caracteres.</p>
              </div>
            </div>

            <div>
              <Label className="text-xs text-emerald-600 font-bold">Intervalo de feedback</Label>
              <p className="text-[11px] text-muted-foreground mb-1">A cada quantos dias você quer receber feedback dos alunos?</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={60} value={feedbackIntervalDays}
                  onChange={(e) => setFeedbackIntervalDays(Math.min(60, Math.max(1, Number(e.target.value) || 7)))}
                  className="h-9 text-sm w-16 text-center"
                />
                <span className="text-xs text-muted-foreground">dias</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
              <Label className="text-xs text-primary uppercase tracking-wider">Código de convite</Label>
              <p className="text-[11px] text-muted-foreground">Compartilhe com seus alunos.</p>
              <div className="flex gap-2">
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="EX: ELITE26"
                  maxLength={12}
                  className="h-9 text-sm font-mono tracking-widest uppercase"
                />
                <Button type="button" variant="outline" size="sm" onClick={generateCode} disabled={generating}>{generating ? "..." : "Gerar"}</Button>
                <Button type="button" variant="outline" size="sm" onClick={copyCode} disabled={!inviteCode}>Copiar</Button>
              </div>
              {inviteCodeHasAmbiguousChars && (
                <p className="text-[10px] text-amber-600">
                  Contém caracteres parecidos entre si (0/O, 1/I) — pode confundir o aluno ao digitar.
                </p>
              )}
            </div>

            <Button onClick={save} disabled={!canSave} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? "Salvando..." : "Salvar Perfil"}
            </Button>

            <div className="border-t border-border pt-3">
              <ChangePasswordButton variant="outline" className="w-full" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ProfileDialog;
