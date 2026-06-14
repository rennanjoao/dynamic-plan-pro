import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Users, Wallet, CheckCircle2, Ban, Loader2, Save, Unlock, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_PRICE_PER_STUDENT = 50;
const BILLING_KEY = "coach_billing_state";

type BillingState = {
  price_per_student: number;
  overrides: Record<string, number>; // coach_id -> price
  paid: Record<string, string>; // coach_id -> "YYYY-MM"
};

const DEFAULT_STATE: BillingState = {
  price_per_student: DEFAULT_PRICE_PER_STUDENT,
  overrides: {},
  paid: {},
};

type CoachRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  notification_email: string | null;
  blocked_until: string | null;
  active_students: number;
  unit_price: number;
  amount: number;
  status: "paid" | "pending" | "blocked";
};

function isBlocked(blocked_until?: string | null): boolean {
  if (!blocked_until) return false;
  return new Date(blocked_until) > new Date();
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CoachBillingPanel = () => {
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [state, setState] = useState<BillingState>(DEFAULT_STATE);
  const [priceInput, setPriceInput] = useState<string>(String(DEFAULT_PRICE_PER_STUDENT));
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});
  const monthKey = useMemo(() => currentMonthKey(), []);

  const persistState = async (next: BillingState) => {
    setState(next);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("app_settings").upsert(
      {
        key: BILLING_KEY,
        value: next as any,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", BILLING_KEY)
        .maybeSingle();
      const loaded: BillingState = {
        ...DEFAULT_STATE,
        ...((settings?.value as Partial<BillingState>) ?? {}),
      };
      loaded.overrides = loaded.overrides ?? {};
      loaded.paid = loaded.paid ?? {};
      setState(loaded);
      setPriceInput(String(loaded.price_per_student));

      const { data: coachRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "coach");
      if (rolesErr) throw rolesErr;

      const coachIds = (coachRoles ?? []).map((r) => r.user_id);
      if (coachIds.length === 0) {
        setRows([]);
        return;
      }

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, notification_email, blocked_until")
        .in("user_id", coachIds);
      if (profErr) throw profErr;

      // Conta alunos ATIVOS vinculados via coach_students (fonte real de vínculos).
      const { data: links, error: linksErr } = await supabase
        .from("coach_students")
        .select("coach_id, student_id, status")
        .in("coach_id", coachIds)
        .eq("status", "active");
      if (linksErr) throw linksErr;

      const studentCount = new Map<string, Set<string>>();
      (links ?? []).forEach((p: any) => {
        if (!p.coach_id || !p.student_id) return;
        if (!studentCount.has(p.coach_id)) studentCount.set(p.coach_id, new Set());
        studentCount.get(p.coach_id)!.add(p.student_id);
      });

      const mKey = currentMonthKey();
      const paidSet = new Set(
        Object.entries(loaded.paid ?? {})
          .filter(([, v]) => v === mKey)
          .map(([k]) => k),
      );

      const result: CoachRow[] = (profiles ?? []).map((p: any) => {
        const active = studentCount.get(p.user_id)?.size ?? 0;
        const blocked = isBlocked(p.blocked_until);
        const paid = paidSet.has(p.user_id);
        const unit_price =
          typeof loaded.overrides?.[p.user_id] === "number"
            ? loaded.overrides[p.user_id]
            : loaded.price_per_student;
        const status: CoachRow["status"] = blocked ? "blocked" : paid ? "paid" : "pending";
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email ?? p.notification_email ?? null,
          notification_email: p.notification_email,
          blocked_until: p.blocked_until,
          active_students: active,
          unit_price,
          amount: active * unit_price,
          status,
        };
      });

      setRows(result);
      setOverrideInputs(
        Object.fromEntries(result.map((r) => [r.user_id, String(r.unit_price)])),
      );
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao carregar cobranças");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markPaid = async (coach: CoachRow) => {
    setBusy(coach.user_id);
    try {
      const next: BillingState = {
        ...state,
        paid: { ...(state.paid ?? {}), [coach.user_id]: monthKey },
      };
      await persistState(next);
      toast.success(`Pagamento registrado para ${coach.full_name ?? "coach"}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao marcar como pago");
    } finally {
      setBusy(null);
    }
  };

  const unmarkPaid = async (coach: CoachRow) => {
    setBusy(coach.user_id);
    try {
      const nextPaid = { ...(state.paid ?? {}) };
      delete nextPaid[coach.user_id];
      await persistState({ ...state, paid: nextPaid });
      toast.success("Pagamento revertido");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao reverter");
    } finally {
      setBusy(null);
    }
  };

  const block30 = async (coach: CoachRow) => {
    setBusy(coach.user_id);
    try {
      const blockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: "block-user", trainerId: coach.user_id, blockedUntil },
      });
      if (error) throw error;
      toast.success(`${coach.full_name ?? "Coach"} bloqueado por 30 dias`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao bloquear coach");
    } finally {
      setBusy(null);
    }
  };

  const unblock = async (coach: CoachRow) => {
    setBusy(coach.user_id);
    try {
      const { error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: "block-user", trainerId: coach.user_id, blockedUntil: null },
      });
      if (error) throw error;
      toast.success(`${coach.full_name ?? "Coach"} desbloqueado`);
      await load();
    } catch (e: any) {
      // Fallback direto na profiles caso a function não aceite null
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ blocked_until: null })
        .eq("user_id", coach.user_id);
      if (pErr) {
        toast.error(pErr.message);
      } else {
        toast.success("Coach desbloqueado");
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const saveGlobalPrice = async () => {
    const v = parseFloat(priceInput.replace(",", "."));
    if (!isFinite(v) || v < 0) {
      toast.error("Preço inválido");
      return;
    }
    await persistState({ ...state, price_per_student: v });
    toast.success("Preço padrão atualizado");
    await load();
  };

  const saveOverride = async (coachId: string) => {
    const raw = overrideInputs[coachId] ?? "";
    const v = parseFloat(String(raw).replace(",", "."));
    if (!isFinite(v) || v < 0) {
      toast.error("Valor inválido");
      return;
    }
    const nextOverrides = { ...(state.overrides ?? {}), [coachId]: v };
    await persistState({ ...state, overrides: nextOverrides });
    toast.success("Valor do coach atualizado");
    await load();
  };

  const resetOverride = async (coachId: string) => {
    const nextOverrides = { ...(state.overrides ?? {}) };
    delete nextOverrides[coachId];
    await persistState({ ...state, overrides: nextOverrides });
    toast.success("Valor resetado para o padrão");
    await load();
  };

  const totalCoaches = rows.length;
  const totalStudents = rows.reduce((sum, r) => sum + r.active_students, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.amount, 0);

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Coaches ativos</p>
            <p className="text-2xl font-bold">{totalCoaches}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Alunos na plataforma</p>
            <p className="text-2xl font-bold">{totalStudents}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Wallet className="w-8 h-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Receita esperada do mês</p>
            <p className="text-2xl font-bold">{fmtBRL(totalRevenue)}</p>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="global-price">Valor padrão por aluno ativo (R$)</Label>
            <Input
              id="global-price"
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
          </div>
          <Button onClick={saveGlobalPrice}>
            <Save className="w-4 h-4 mr-1" />
            Salvar padrão
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Cobrança dos Coaches</h2>
          <span className="text-xs text-muted-foreground ml-2">
            (valor por aluno ativo configurável por coach)
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum coach cadastrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead className="text-center">Alunos ativos</TableHead>
                <TableHead className="text-center">R$ / aluno</TableHead>
                <TableHead className="text-right">Valor do mês</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.email ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{r.active_students}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8 w-24 text-right"
                        value={overrideInputs[r.user_id] ?? ""}
                        onChange={(e) =>
                          setOverrideInputs((s) => ({ ...s, [r.user_id]: e.target.value }))
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Salvar valor"
                        onClick={() => saveOverride(r.user_id)}
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                      {state.overrides?.[r.user_id] !== undefined && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Resetar para padrão"
                          onClick={() => resetOverride(r.user_id)}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtBRL(r.amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.status === "paid" && (
                      <Badge className="bg-green-600 hover:bg-green-600">Pago</Badge>
                    )}
                    {r.status === "pending" && (
                      <Badge className="bg-yellow-500 hover:bg-yellow-500 text-black">
                        Pendente
                      </Badge>
                    )}
                    {r.status === "blocked" && (
                      <Badge variant="destructive">Bloqueado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {r.status === "paid" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.user_id}
                          onClick={() => unmarkPaid(r)}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Reverter pagamento
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.user_id}
                          onClick={() => markPaid(r)}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Marcar como pago
                        </Button>
                      )}
                      {r.status === "blocked" ? (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={busy === r.user_id}
                          onClick={() => unblock(r)}
                        >
                          <Unlock className="w-4 h-4 mr-1" />
                          Desbloquear
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === r.user_id}
                          onClick={() => block30(r)}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          Bloquear 30 dias
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default CoachBillingPanel;