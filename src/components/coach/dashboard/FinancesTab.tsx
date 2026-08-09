import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, DollarSign, Calendar, AlertTriangle, CheckCircle2, Users, Wallet, RefreshCw, ShieldOff, ShieldCheck } from "lucide-react";
import { useCoachFinances } from "@/hooks/useCoachFinances";
import { usePlatformBilling, worstPlatformStatus } from "@/hooks/usePlatformBilling";
import type { StudentLite } from "@/hooks/useCoachStudents";
import { queryKeys } from "@/lib/queryKeys";
import { formatDatePtBR } from "@/lib/formatDate";
import { useConfirm } from "@/components/ConfirmProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "./dashboardUtils";
import { Private } from "@/components/coach/PrivacyMode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "pix_plataforma", label: "PIX (pela plataforma)" },
  { value: "pix_infinitepay", label: "PIX fora da plataforma" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

function isSameMonth(dateStr: string | null | undefined) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function FinancesTab({ coachId, students }: { coachId: string; students: StudentLite[] }) {
  const { data: finances = [], isLoading } = useCoachFinances(coachId);
  const { data: platformCharges = [] } = usePlatformBilling(coachId);
  const platformStatus = worstPlatformStatus(platformCharges);
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ student_id: "", description: "", amount: "", due_date: "" });
  const [editingFinance, setEditingFinance] = useState<{ id: string; due_date: string } | null>(null);
  const [quickBilling, setQuickBilling] = useState<{ student_id: string; student_name: string } | null>(null);
  const [quickForm, setQuickForm] = useState({ description: "Mensalidade", amount: "", due_date: "" });
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [creatingBilling, setCreatingBilling] = useState(false);
  const [payDialog, setPayDialog] = useState<{ id: string } | null>(null);
  const [payMethod, setPayMethod] = useState("pix_plataforma");
  const [savingPayment, setSavingPayment] = useState(false);
  const [busyCheckout, setBusyCheckout] = useState<string | null>(null);

  const { data: coachProfile } = useQuery({
    queryKey: ["coach-infinitepay-handle", coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("infinitepay_handle").eq("user_id", coachId).maybeSingle();
      return (data ?? null) as { infinitepay_handle: string | null } | null;
    },
  });
  const hasInfinitePay = !!coachProfile?.infinitepay_handle;

  const activeStudents = students.filter((s) => !s.isExempt);

  const addFinance = useMutation({
    mutationFn: async () => {
      if (!form.description) throw new Error("Descrição é obrigatória");
      const { error } = await supabase.from("coach_finances").insert({
        coach_id: coachId,
        student_id: form.student_id || null,
        description: form.description,
        amount: Number(form.amount || 0),
        due_date: form.due_date || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro financeiro adicionado!");
      setForm({ student_id: "", description: "", amount: "", due_date: "" });
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaid = async (id: string, currentlyPaid: boolean, method?: string) => {
    try {
      const { error } = await sb.from("coach_finances").update({
        status: currentlyPaid ? "pending" : "paid",
        paid_at: currentlyPaid ? null : new Date().toISOString(),
        payment_method: currentlyPaid ? null : (method ?? null),
      }).eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
      qc.invalidateQueries({ queryKey: ["coach-priority-queue", coachId] });
      toast.success(currentlyPaid ? "Marcado como pendente" : "Marcado como pago");
    } catch (e) {
      toast.error("Erro ao atualizar status: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const confirmPayment = async () => {
    if (!payDialog || savingPayment) return;
    setSavingPayment(true);
    await togglePaid(payDialog.id, false, payMethod);
    setSavingPayment(false);
    setPayDialog(null);
    setPayMethod("pix_plataforma");
  };

  const toggleExempt = async (studentId: string, nextExempt: boolean) => {
    try {
      const { error } = await sb.from("coach_students")
        .update({ is_exempt: nextExempt })
        .eq("coach_id", coachId).eq("student_id", studentId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["coach-students-lite", coachId] });
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
      qc.invalidateQueries({ queryKey: ["coach-priority-queue", coachId] });
      toast.success(nextExempt ? "Aluno isento de cobranças" : "Isenção removida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar isenção");
    }
  };

  const createInfinitePayLink = async (financeId: string) => {
    setBusyCheckout(financeId);
    try {
      const { data, error } = await supabase.functions.invoke("infinitepay-create-link", {
        body: { coach_id: coachId, finance_id: financeId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || "Não foi possível gerar o link");
      await navigator.clipboard.writeText(data.url).catch(() => undefined);
      window.open(data.url, "_blank", "noopener");
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
      toast.success("Link InfinityPay gerado e copiado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setBusyCheckout(null);
    }
  };

  const checkInfinitePayPayment = async (financeId: string) => {
    setBusyCheckout(financeId);
    try {
      const { data, error } = await supabase.functions.invoke("infinitepay-create-link", {
        body: { coach_id: coachId, finance_id: financeId, action: "check" },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
      toast[data?.paid ? "success" : "info"](data?.paid ? "Pagamento confirmado!" : "Ainda sem pagamento confirmado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao verificar pagamento");
    } finally {
      setBusyCheckout(null);
    }
  };

  const deleteFinance = async (id: string) => {
    if (!(await confirm({ title: "Remover registro", description: "Remover registro financeiro?", destructive: true, confirmLabel: "Remover" }))) return;
    try {
      const { error } = await supabase.from("coach_finances").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
    } catch (e) {
      toast.error("Erro ao remover: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const updateDueDate = async () => {
    if (!editingFinance || savingDueDate) return;
    setSavingDueDate(true);
    try {
      const { error } = await supabase.from("coach_finances")
        .update({ due_date: editingFinance.due_date || null })
        .eq("id", editingFinance.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
      setEditingFinance(null);
      toast.success("Data de vencimento atualizada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar vencimento");
    } finally {
      setSavingDueDate(false);
    }
  };

  const createQuickBilling = async () => {
    if (!quickBilling || creatingBilling) return;
    setCreatingBilling(true);
    try {
      const { error } = await supabase.from("coach_finances").insert({
        coach_id: coachId,
        student_id: quickBilling.student_id,
        description: quickForm.description || "Mensalidade",
        amount: Number(quickForm.amount || 0),
        due_date: quickForm.due_date || null,
        status: "pending",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: queryKeys.coachFinances() });
      toast.success(`Cobrança criada para ${quickBilling.student_name}. O aluno receberá o alerta.`);
      setQuickBilling(null);
      setQuickForm({ description: "Mensalidade", amount: "", due_date: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar cobrança");
    } finally {
      setCreatingBilling(false);
    }
  };

  // Cards escopados ao mês corrente (receita por paid_at, pendências por due_date).
  const totalReceita  = finances.filter((f) => f.status === "paid" && isSameMonth(f.paid_at)).reduce((s, f) => s + Number(f.amount), 0);
  const totalPendente = finances.filter((f) => f.status === "pending" && isSameMonth(f.due_date)).reduce((s, f) => s + Number(f.amount), 0);
  const totalAtrasado = finances.filter((f) => f.status === "pending" && isSameMonth(f.due_date) && f.due_date && new Date(f.due_date) < new Date()).reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="space-y-4">
      {platformStatus && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
          platformStatus === "blocked"
            ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
        }`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold">
              {platformStatus === "blocked" ? "Assinatura da plataforma bloqueada" : "Assinatura da plataforma pendente"}
            </p>
            <p className="text-[11px] mt-0.5 opacity-90">
              {platformCharges
                .map((c) => `${c.period} — R$ ${Number(c.amount).toFixed(2)}`)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Receita (Pago)"  value={`R$ ${totalReceita.toFixed(0)}`}  icon={<DollarSign className="w-4 h-4" />}   accent="#10B981" />
        <StatCard label="Pendente"         value={`R$ ${totalPendente.toFixed(0)}`} icon={<Calendar className="w-4 h-4" />}     accent="#F59E0B" />
        <StatCard label="Atrasado"         value={`R$ ${totalAtrasado.toFixed(0)}`} icon={<AlertTriangle className="w-4 h-4" />} accent="#EF4444" />
        <StatCard label="Alunos ativos"    value={activeStudents.length}            icon={<Users className="w-4 h-4" />}        accent="#3B82F6" />
      </div>

      <div className="flex items-center justify-between mt-6">
        <h3 className="text-sm font-semibold text-foreground">Alunos Ativos & Mensalidades</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Cobrança Avulsa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum aluno ativo para faturar.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Aluno</TableHead>
                <TableHead className="text-xs">Ativação (Anamnese)</TableHead>
                <TableHead className="text-xs">Vencimento Atual</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const activeFinance = finances
                  .filter((f) => f.student_id === student.id && f.status === "pending")
                  .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())[0];

                const isOverdue = activeFinance?.status === "pending" && activeFinance.due_date && new Date(activeFinance.due_date) < new Date();

                return (
                  <TableRow key={student.id}>
                    <TableCell className="text-sm font-semibold"><Private>{student.name}</Private></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {student.lastAnamnesis ? formatDatePtBR(student.lastAnamnesis) : "Aguardando"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {activeFinance?.due_date ? formatDatePtBR(activeFinance.due_date) : "Sem pendências"}
                    </TableCell>
                    <TableCell>
                      {activeFinance ? (
                        <button
                          onClick={() => togglePaid(activeFinance.id, false)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${
                            isOverdue ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"
                          }`}
                        >
                          {isOverdue ? "Atrasado" : "Pendente"}
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">Em dia</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {activeFinance ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => setEditingFinance({ id: activeFinance.id, due_date: activeFinance.due_date || "" })} title="Alterar Data">
                            <Calendar className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-emerald-500"
                            onClick={() => togglePaid(activeFinance.id, false)} title="Marcar como Pago">
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteFinance(activeFinance.id)} title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => { setQuickBilling({ student_id: student.id, student_name: student.name }); setQuickForm({ description: "Mensalidade", amount: "", due_date: "" }); }}>
                          <Plus className="w-3 h-3" /> Gerar Cobrança
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!quickBilling} onOpenChange={(open) => !open && setQuickBilling(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Gerar Cobrança</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Para: <strong>{quickBilling?.student_name}</strong></p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={quickForm.description} onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" value={quickForm.amount} onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })} placeholder="0,00" className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input type="date" value={quickForm.due_date} onChange={(e) => setQuickForm({ ...quickForm, due_date: e.target.value })} className="mt-1 h-9 text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              O aluno verá um alerta de cobrança no painel dele assim que a data de vencimento se aproximar.
            </p>
            <Button onClick={createQuickBilling} disabled={creatingBilling} className="w-full">
              {creatingBilling ? "Criando..." : "Criar Cobrança"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingFinance} onOpenChange={(open) => !open && setEditingFinance(null)}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader><DialogTitle>Alterar Vencimento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nova Data de Vencimento</Label>
              <Input
                type="date"
                value={editingFinance?.due_date || ""}
                onChange={(e) => setEditingFinance((prev) => prev ? { ...prev, due_date: e.target.value } : null)}
                className="mt-1 h-9"
              />
            </div>
            <Button onClick={updateDueDate} disabled={savingDueDate} className="w-full">
              {savingDueDate ? "Salvando..." : "Salvar Alteração"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Lançar Cobrança Manual</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Descrição *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Ajuste de Protocolo" className="mt-1 h-9 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Valor (R$)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 h-9 text-sm" /></div>
              <div><Label className="text-xs">Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1 h-9 text-sm" /></div>
            </div>
            <div>
              <Label className="text-xs">Vincular Aluno</Label>
              <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => addFinance.mutate()} disabled={addFinance.isPending} className="w-full">Adicionar Lançamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FinancesTab;