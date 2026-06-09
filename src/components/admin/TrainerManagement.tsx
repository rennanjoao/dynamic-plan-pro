import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  UserPlus, Users, Trash2, Shield, Mail, Key, Dices, LockKeyhole,
  Ban, BanIcon, Clock, Copy, Link2, RefreshCw, CheckCircle2, Loader2,
} from "lucide-react";

interface Trainer {
  id: string;
  email: string;
  full_name: string | null;
  team_name: string | null;
  notification_email: string | null;
  role: string;
  created_at: string;
  invite_code?: string | null;
  trial_ends_at?: string | null;
  blocked_until?: string | null;
}

interface ProfileInviteInfo {
  user_id: string;
  invite_code: string | null;
  notification_email: string | null;
  blocked_until: string | null;
}

interface CoachInvite {
  id: string;
  token: string;
  email?: string;
  expires_at: string;
  used_at: string | null;
  note: string | null;
  created_at: string;
}

interface ManageTrainersResponse {
  trainers?: Trainer[];
  invites?: CoachInvite[];
  invite?: CoachInvite;
  error?: string;
  success?: boolean;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message || fallback : fallback;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isBlocked(blocked_until?: string | null): boolean {
  if (!blocked_until) return false;
  return new Date(blocked_until) > new Date();
}

export const TrainerManagement = () => {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [invites, setInvites] = useState<CoachInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: "", expiresInDays: 30, note: "" });
  const [newTrainer, setNewTrainer] = useState({
    email: "",
    password: "",
    fullName: "",
    teamName: "",
    notificationEmail: "",
    role: "coach" as "coach" | "user",
  });

  const loadTrainers = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<ManageTrainersResponse>("manage-trainers", {
      body: { action: "list" },
    });

    if (!error && data?.trainers) {
      const ids = data.trainers.map((t) => t.id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, invite_code, notification_email, blocked_until")
        .in("user_id", ids);

      const mergedTrainers = data.trainers.map((t) => {
        const profile = (profiles as ProfileInviteInfo[] | null)?.find((p) => p.user_id === t.id);
        return {
          ...t,
          invite_code: t.invite_code || profile?.invite_code || null,
          notification_email: t.notification_email || profile?.notification_email || null,
          blocked_until: t.blocked_until || profile?.blocked_until || null,
        };
      });

      setTrainers(mergedTrainers);
    }
  }, []);

  useEffect(() => { loadTrainers(); }, [loadTrainers]);

  const loadInvites = async () => {
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<ManageTrainersResponse>("manage-trainers", {
        body: { action: "list-invites" },
      });
      if (!error && data?.invites) setInvites(data.invites);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!newInvite.email) {
      toast.error("O email do coach é obrigatório para enviar o convite.");
      return;
    }
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<ManageTrainersResponse>("manage-trainers", {
        body: { 
          action: "generate-coach-invite", 
          email: newInvite.email, 
          expiresInDays: newInvite.expiresInDays, 
          note: newInvite.note 
        },
      });
      if (error || data?.error) throw new Error(data?.error || "Erro ao gerar convite");
      toast.success("Convite gerado e enviado por e-mail!");
      setNewInvite({ email: "", expiresInDays: 30, note: "" });
      loadInvites();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Erro ao gerar convite"));
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/register?invite=${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const handleCreateTrainer = async () => {
    if (!newTrainer.email || !newTrainer.password || !newTrainer.fullName) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (newTrainer.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: {
          action: "create",
          email: newTrainer.email,
          password: newTrainer.password,
          fullName: newTrainer.fullName,
          teamName: newTrainer.teamName || null,
          notificationEmail: newTrainer.notificationEmail || newTrainer.email,
          role: newTrainer.role,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${newTrainer.role === "coach" ? "Coach" : "Treinador"} criado com sucesso!`);
      setNewTrainer({ email: "", password: "", fullName: "", teamName: "", notificationEmail: "", role: "coach" });
      setShowDialog(false);
      loadTrainers();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao criar"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateNotificationEmail = async (trainerId: string, email: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_email: email })
        .eq("user_id", trainerId);
      if (error) throw error;
      toast.success("Email de notificação atualizado!");
      loadTrainers();
    } catch {
      toast.error("Erro ao atualizar email");
    }
  };

  const handleUpdateInviteCode = async (trainerId: string, newCode: string) => {
    try {
      const code = newCode.trim().toUpperCase();
      if (!code) throw new Error("O código não pode estar vazio.");

      const { error } = await supabase
        .from("profiles")
        .update({ invite_code: code })
        .eq("user_id", trainerId);

      if (error) {
        if (error.code === "23505") throw new Error("Este código já está em uso por outro profissional.");
        throw error;
      }

      toast.success("Código de convite salvo!");
      loadTrainers();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao salvar código"));
    }
  };

  const handleUpdatePassword = async (trainerId: string, password: string) => {
    try {
      if (password.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres");
      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: "update-password", trainerId, password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Senha atualizada com sucesso!");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao atualizar senha"));
    }
  };

  const handleBlockUser = async (trainerId: string, blockedUntil: string | null) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: blockedUntil ? "block-user" : "unblock-user", trainerId, blockedUntil },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(blockedUntil ? "Acesso bloqueado até " + fmtDate(blockedUntil) : "Acesso desbloqueado!");
      loadTrainers();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao bloquear/desbloquear"));
    }
  };

  const handleDeleteTrainer = async (trainerId: string) => {
    if (!confirm("Tem certeza que deseja remover este profissional?")) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: "delete", trainerId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Profissional removido");
      loadTrainers();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao remover"));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Gestão de Profissionais</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => { setShowInvites(true); loadInvites(); }}
            size="sm" variant="outline" className="gap-2"
          >
            <Link2 className="w-4 h-4" /> Convites Coach
          </Button>
          <Button onClick={() => setShowDialog(true)} size="sm" className="gap-2">
            <UserPlus className="w-4 h-4" /> Novo Profissional
          </Button>
        </div>
      </div>

      {trainers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum profissional cadastrado ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {trainers.map((trainer) => (
            <TrainerRow
              key={trainer.id}
              trainer={trainer}
              onDelete={handleDeleteTrainer}
              onUpdateEmail={handleUpdateNotificationEmail}
              onUpdateCode={handleUpdateInviteCode}
              onUpdatePassword={handleUpdatePassword}
              onBlock={handleBlockUser}
            />
          ))}
        </div>
      )}

      {/* Dialog criar profissional */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Criar Novo Profissional</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo</Label>
              <Select value={newTrainer.role} onValueChange={(v) => setNewTrainer({ ...newTrainer, role: v as "coach" | "user" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coach">Coach / Treinador</SelectItem>
                  <SelectItem value="user">Aluno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome Completo *</Label>
              <Input placeholder="Nome do profissional" value={newTrainer.fullName}
                onChange={(e) => setNewTrainer({ ...newTrainer, fullName: e.target.value })} />
            </div>
            <div>
              <Label>Nome da Equipe</Label>
              <Input placeholder="Ex: Team Elite, Studio Fit" value={newTrainer.teamName}
                onChange={(e) => setNewTrainer({ ...newTrainer, teamName: e.target.value })} />
            </div>
            <div>
              <Label>Email de login *</Label>
              <Input type="email" placeholder="email@exemplo.com" value={newTrainer.email}
                onChange={(e) => setNewTrainer({ ...newTrainer, email: e.target.value })} />
            </div>
            <div>
              <Label>Email para receber notificações dos alunos</Label>
              <p className="text-[11px] text-muted-foreground mb-1">
                Se diferente do login. Deixe vazio para usar o mesmo.
              </p>
              <Input type="email" placeholder="notificacoes@exemplo.com" value={newTrainer.notificationEmail}
                onChange={(e) => setNewTrainer({ ...newTrainer, notificationEmail: e.target.value })} />
            </div>
            <div>
              <Label>Senha *</Label>
              <Input type="password" placeholder="Mínimo 6 caracteres" value={newTrainer.password}
                onChange={(e) => setNewTrainer({ ...newTrainer, password: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateTrainer} disabled={isLoading}>
              {isLoading ? "Criando..." : "Criar Profissional"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog convites coach */}
      <Dialog open={showInvites} onOpenChange={setShowInvites}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convites para Coach</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gerar novo convite</p>
              
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs">Email do Coach *</Label>
                  <Input
                    type="email"
                    value={newInvite.email}
                    onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                    placeholder="coach@exemplo.com"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Trial Expira em (dias)</Label>
                  <Input
                    type="number" min={1} max={90}
                    value={newInvite.expiresInDays}
                    onChange={(e) => setNewInvite({ ...newInvite, expiresInDays: Number(e.target.value) || 30 })}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Observação (opcional)</Label>
                  <Input
                    value={newInvite.note}
                    onChange={(e) => setNewInvite({ ...newInvite, note: e.target.value })}
                    placeholder="Ex: Novo Profissional"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
              <Button onClick={handleGenerateInvite} disabled={inviteLoading} className="w-full gap-2">
                {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Gerar Link e Enviar Email
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Convites gerados</p>
              <Button size="sm" variant="ghost" onClick={loadInvites} className="h-7 gap-1 text-xs">
                <RefreshCw className="w-3 h-3" /> Atualizar
              </Button>
            </div>

            {inviteLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum convite gerado ainda.</p>
            ) : (
              <div className="space-y-2">
                {invites.map((inv) => {
                  const expired = new Date(inv.expires_at) < new Date();
                  return (
                    <div key={inv.id} className={`rounded-lg border p-3 text-xs space-y-1 ${
                      inv.used_at ? "border-emerald-500/30 bg-emerald-500/5" :
                      expired ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" :
                      "border-border bg-card"
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-foreground break-all">
                          {inv.token.slice(0, 16)}...
                        </code>
                        <div className="flex items-center gap-1 shrink-0">
                          {inv.used_at ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Usado
                            </span>
                          ) : expired ? (
                            <span className="text-red-500 font-medium">Expirado</span>
                          ) : (
                            <Button
                              size="sm" variant="outline" className="h-6 text-[11px] gap-1 px-2"
                              onClick={() => copyInviteLink(inv.token)}
                            >
                              <Copy className="w-3 h-3" /> Copiar link
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-muted-foreground">
                        {inv.email && <span className="block mb-1 text-foreground font-medium">{inv.email}</span>}
                        Expira: {fmtDate(inv.expires_at)}
                        {inv.note ? ` · ${inv.note}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

/* ── Linha do treinador com edição inline + bloquear ─────────── */
function TrainerRow({ trainer, onDelete, onUpdateEmail, onUpdateCode, onUpdatePassword, onBlock }: {
  trainer: Trainer;
  onDelete: (id: string) => void;
  onUpdateEmail: (id: string, email: string) => void;
  onUpdateCode: (id: string, code: string) => void;
  onUpdatePassword: (id: string, password: string) => void;
  onBlock: (id: string, blockedUntil: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingBlock, setEditingBlock] = useState(false);
  const [emailVal, setEmailVal] = useState(trainer.notification_email || trainer.email || "");
  const [codeVal, setCodeVal] = useState(trainer.invite_code || "");
  const [passwordVal, setPasswordVal] = useState("");
  const [blockDate, setBlockDate] = useState("");

  const blocked = isBlocked(trainer.blocked_until);

  const generateRandomCode = () => {
    setCodeVal(Math.random().toString(36).substring(2, 8).toUpperCase());
  };

  const closeAll = () => {
    setEditing(false);
    setEditingCode(false);
    setEditingPassword(false);
    setEditingBlock(false);
  };

  return (
    <div className={`p-3 rounded-lg border space-y-2 ${
      blocked
        ? "bg-red-50/60 border-red-200 dark:bg-red-950/20 dark:border-red-900"
        : "bg-secondary/30 border-border/50"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className={`w-4 h-4 ${blocked ? "text-destructive" : "text-primary"}`} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{trainer.full_name || "Sem nome"}</p>
              <Badge variant={trainer.role === "coach" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                {trainer.role === "coach" ? "Coach" : "Aluno"}
              </Badge>
              {blocked && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200">
                  <Ban className="w-2.5 h-2.5 mr-1" /> Bloqueado até {fmtDate(trainer.blocked_until)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {trainer.email}{trainer.team_name ? ` · ${trainer.team_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { closeAll(); setEditingBlock(!editingBlock); }}
            title={blocked ? "Desbloquear acesso" : "Bloquear acesso"} className={blocked ? "text-emerald-600" : "text-amber-500"}>
            {blocked ? <BanIcon className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { closeAll(); setEditingCode(!editingCode); }} title="Editar código de convite">
            <Key className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { closeAll(); setEditing(!editing); }} title="Editar email de notificação">
            <Mail className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { closeAll(); setEditingPassword(!editingPassword); }} title="Alterar senha de acesso">
            <LockKeyhole className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(trainer.id)} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Bloquear/Desbloquear */}
      {editingBlock && (
        <div className="pt-1 border-t border-border/20 mt-2 space-y-2">
          {blocked ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Acesso bloqueado até <strong>{fmtDate(trainer.blocked_until)}</strong>
              </p>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                onClick={() => { onBlock(trainer.id, null); closeAll(); }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Desbloquear agora
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Bloquear acesso até</p>
                <Input
                  type="datetime-local"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1"
                disabled={!blockDate}
                onClick={() => {
                  onBlock(trainer.id, new Date(blockDate).toISOString());
                  closeAll();
                }}>
                <Ban className="w-3.5 h-3.5" /> Bloquear
              </Button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="flex gap-2 items-center pt-1 border-t border-border/20 mt-2">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Email de notificação dos alunos</p>
            <Input type="email" value={emailVal} onChange={(e) => setEmailVal(e.target.value)}
              placeholder="email@exemplo.com" className="h-8 text-xs" />
          </div>
          <Button size="sm" className="mt-4 h-8 text-xs" onClick={() => { onUpdateEmail(trainer.id, emailVal); setEditing(false); }}>
            Salvar
          </Button>
        </div>
      )}

      {editingCode && (
        <div className="flex gap-2 items-center pt-1 border-t border-border/20 mt-2">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Código de Convite</p>
            <div className="flex gap-2">
              <Input type="text" value={codeVal} onChange={(e) => setCodeVal(e.target.value.toUpperCase())}
                placeholder="Ex: ELITE2026" className="h-8 text-xs font-mono uppercase" />
              <Button size="sm" variant="outline" className="h-8 px-2 shrink-0" onClick={generateRandomCode} title="Gerar código aleatório">
                <Dices className="w-4 h-4 text-primary" />
              </Button>
            </div>
          </div>
          <Button size="sm" className="mt-4 h-8 text-xs" onClick={() => { onUpdateCode(trainer.id, codeVal); setEditingCode(false); }}>
            Salvar
          </Button>
        </div>
      )}

      {editingPassword && (
        <div className="flex gap-2 items-center pt-1 border-t border-border/20 mt-2">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Nova senha de acesso</p>
            <Input type="password" value={passwordVal} onChange={(e) => setPasswordVal(e.target.value)}
              placeholder="Mínimo 6 caracteres" className="h-8 text-xs" />
          </div>
          <Button size="sm" className="mt-4 h-8 text-xs"
            onClick={() => { onUpdatePassword(trainer.id, passwordVal); setPasswordVal(""); setEditingPassword(false); }}>
            Salvar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Mail className="w-3 h-3" />
          Notificações: {trainer.notification_email || trainer.email || "—"}
        </p>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Key className="w-3 h-3" />
          Código: <span className="font-mono font-bold text-foreground">{trainer.invite_code || "Não gerado"}</span>
        </p>
        {trainer.trial_ends_at && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Trial até: {fmtDate(trainer.trial_ends_at)}
          </p>
        )}
      </div>
    </div>
  );
}
