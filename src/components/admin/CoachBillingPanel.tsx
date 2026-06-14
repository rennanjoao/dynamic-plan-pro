import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Users, Wallet, CheckCircle2, Ban, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PRICE_PER_STUDENT = 50;

type CoachRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  notification_email: string | null;
  blocked_until: string | null;
  active_students: number;
  amount: number;
  status: "paid" | "pending" | "blocked";
};

function isBlocked(blocked_until?: string | null): boolean {
  if (!blocked_until) return false;
  return new Date(blocked_until) > new Date();
}

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

const CoachBillingPanel = () => {
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
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

      const { data: plans, error: plansErr } = await supabase
        .from("coach_plans")
        .select("coach_id, student_id")
        .in("coach_id", coachIds);
      if (plansErr) throw plansErr;

      const studentCount = new Map<string, Set<string>>();
      (plans ?? []).forEach((p: any) => {
        if (!p.coach_id || !p.student_id) return;
        if (!studentCount.has(p.coach_id)) studentCount.set(p.coach_id, new Set());
        studentCount.get(p.coach_id)!.add(p.student_id);
      });

      const { start, end } = currentMonthBounds();
      const { data: subs, error: subsErr } = await supabase
        .from("subscriptions")
        .select("user_id, status, current_period_start")
        .in("user_id", coachIds)
        .gte("current_period_start", start.toISOString())
        .lt("current_period_start", end.toISOString());
      if (subsErr) throw subsErr;

      const paidSet = new Set(
        (subs ?? [])
          .filter((s: any) => s.status === "paid" || s.status === "active")
          .map((s: any) => s.user_id),
      );

      const result: CoachRow[] = (profiles ?? []).map((p: any) => {
        const active = studentCount.get(p.user_id)?.size ?? 0;
        const blocked = isBlocked(p.blocked_until);
        const paid = paidSet.has(p.user_id);
        const status: CoachRow["status"] = blocked ? "blocked" : paid ? "paid" : "pending";
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email ?? p.notification_email ?? null,
          notification_email: p.notification_email,
          blocked_until: p.blocked_until,
          active_students: active,
          amount: active * PRICE_PER_STUDENT,
          status,
        };
      });

      setRows(result);
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
      const { start, end } = currentMonthBounds();
      const { error } = await supabase.from("subscriptions").upsert(
        {
          user_id: coach.user_id,
          plan_type: "coach_monthly_fee",
          status: "paid",
          current_period_start: new Date().toISOString(),
          current_period_end: end.toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success(`Pagamento registrado para ${coach.full_name ?? "coach"}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao marcar como pago");
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
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Cobrança dos Coaches</h2>
          <span className="text-xs text-muted-foreground ml-2">
            (R$ {PRICE_PER_STUDENT} por aluno ativo)
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
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.user_id || r.status === "paid"}
                        onClick={() => markPaid(r)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Marcar como pago
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === r.user_id || r.status === "blocked"}
                        onClick={() => block30(r)}
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Bloquear 30 dias
                      </Button>
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