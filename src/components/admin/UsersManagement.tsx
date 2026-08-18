// Painel global de usuários (Admin).
// Lista TODOS os perfis (Aluno, Coach, Parceiro, Admin) via edge function
// `manage-trainers`, que valida role admin no servidor. Nenhuma operação
// sensível acontece direto do navegador contra auth.users.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Pencil, RefreshCw, Search, ShieldAlert, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { adminUsersApi, useAdminUsers, type AdminUser } from "@/hooks/useAdminUsers";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", coach: "Coach", user: "Aluno", partner: "Parceiro" };
const PER_PAGE = 50;

export function UsersManagement() {
  const qc = useQueryClient();
  const [role, setRole] = useState("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminUsers({ role, search, page, perPage: PER_PAGE });
  const users = data?.users ?? [];
  const total = data?.total ?? users.length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setEditName(u.full_name ?? "");
    setEditEmail(u.email ?? "");
    setEditRole(u.roles.includes("admin") ? "admin" : u.roles.includes("coach") ? "coach" : "user");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await adminUsersApi.call({
        action: "update-user",
        targetId: editing.id,
        fullName: editName,
        email: editEmail !== (editing.email ?? "") ? editEmail : undefined,
      });
      const currentRole = editing.roles.includes("admin") ? "admin" : editing.roles.includes("coach") ? "coach" : "user";
      if (editRole !== currentRole) {
        await adminUsersApi.call({ action: "set-role", targetId: editing.id, role: editRole });
      }
      invalidate();
      setEditing(null);
      toast({ title: "Usuário atualizado" });
    } catch (e) {
      toast({ title: "Falha ao atualizar", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async (u: AdminUser) => {
    setBusy(true);
    try {
      const blockedUntil = u.blocked_until ? null : new Date(Date.now() + 365 * 864e5).toISOString();
      await adminUsersApi.call({ action: "update-user", targetId: u.id, blockedUntil });
      invalidate();
      toast({ title: blockedUntil ? "Usuário bloqueado" : "Bloqueio removido" });
    } catch (e) {
      toast({ title: "Falha ao alterar bloqueio", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await adminUsersApi.call({ action: "delete", trainerId: deleting.id });
      invalidate();
      setDeleting(null);
      toast({ title: "Conta excluída" });
    } catch (e) {
      toast({ title: "Falha ao excluir", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Usuários totais</h2>
          <p className="text-xs text-muted-foreground">Alunos, coaches, parceiros e administradores.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Papel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            <SelectItem value="user">Alunos</SelectItem>
            <SelectItem value="coach">Coaches</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="partner">Parceiros</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex gap-2 flex-1 min-w-[220px]"
          onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}
        >
          <Input placeholder="Buscar por nome ou e-mail" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          <Button type="submit" variant="secondary" className="gap-1.5"><Search className="w-4 h-4" /> Buscar</Button>
        </form>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error instanceof Error ? error.message : "Falha ao carregar usuários"}
        </p>
      )}
      {!isLoading && !isError && users.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum usuário encontrado com esses filtros.</p>
      )}

      {users.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const blocked = !!u.blocked_until && new Date(u.blocked_until) > new Date();
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => <Badge key={r} variant="outline">{ROLE_LABEL[r] ?? r}</Badge>)}
                        {u.is_partner && <Badge variant="outline" className="border-primary/40 text-primary">Parceiro</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {blocked
                        ? <Badge variant="destructive">Bloqueado</Badge>
                        : <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">Ativo</Badge>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" title={blocked ? "Desbloquear" : "Bloquear"} disabled={busy} onClick={() => toggleBlock(u)}>
                        <UserX className={`w-4 h-4 ${blocked ? "text-destructive" : ""}`} />
                      </Button>
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => setDeleting(u)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} usuário(s)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 1 || isFetching} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="self-center">Página {page}</span>
          <Button size="sm" variant="outline" disabled={users.length < PER_PAGE || isFetching} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>

      {/* Edição */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Aluno</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                O servidor impede rebaixar o último administrador e alterar o próprio papel.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Excluir conta definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A conta de <strong>{deleting?.full_name ?? deleting?.email}</strong> será removida do sistema de login.
              Esta operação é <strong>irreversível</strong> e fica registrada na auditoria administrativa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default UsersManagement;
