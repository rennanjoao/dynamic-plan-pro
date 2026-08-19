import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, ShieldOff, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ConfirmProvider";
import { useStudentPlanCatalog, useSavePlan, useDeactivatePlan } from "@/hooks/useStudentPlans";
import { formatCents, toCents, type StudentPlan } from "@/lib/studentPlans";

interface PlanForm {
  id?: string;
  slug: string;
  name: string;
  amount: string;
  duration_months: string;
  description: string;
  benefits: string;
  is_active: boolean;
}

const emptyForm: PlanForm = {
  id: undefined,
  slug: "",
  name: "",
  amount: "",
  duration_months: "1",
  description: "",
  benefits: "",
  is_active: true,
};

function slugify(name: string) {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function PlanCatalogManager({ coachId }: { coachId: string }) {
  const { data: allPlans = [] } = useStudentPlanCatalog(coachId);
  const myPlans = allPlans.filter((p) => p.coach_id === coachId);
  const savePlan = useSavePlan(coachId);
  const deactivatePlan = useDeactivatePlan(coachId);
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanForm | null>(null);

  const startNew = () => setEditing({ ...emptyForm });
  const startEdit = (p: StudentPlan) =>
    setEditing({
      id: p.id,
      slug: p.slug,
      name: p.name,
      amount: (p.price_cents / 100).toFixed(2),
      duration_months: String(p.duration_months),
      description: p.description || "",
      benefits: p.benefits.join("\n"),
      is_active: p.is_active,
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Nome é obrigatório");
    const price_cents = toCents(editing.amount);
    if (!price_cents) return toast.error("Informe um valor válido");
    const duration_months = Number(editing.duration_months) || 1;
    try {
      await savePlan.mutateAsync({
        id: editing.id,
        slug: editing.slug || slugify(editing.name),
        name: editing.name.trim(),
        price_cents,
        duration_months,
        description: editing.description.trim() || null,
        benefits: editing.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
        is_active: editing.is_active,
      });
      toast.success("Plano salvo!");
      setEditing(null);
    } catch (e) {
      toast.error("Erro ao salvar plano: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const remove = async (p: StudentPlan) => {
    const sure = await confirm({
      title: "Desativar plano?",
      description: `"${p.name}" deixará de aparecer na lista de novas cobranças. Contratos e cobranças já existentes não são afetados.`,
    });
    if (!sure) return;
    try {
      await deactivatePlan.mutateAsync(p.id);
      toast.success("Plano desativado");
    } catch (e) {
      toast.error("Erro ao desativar: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Wallet className="w-3.5 h-3.5" /> Meus Planos
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Meus Planos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {myPlans.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Você ainda não tem planos próprios. Enquanto isso, os planos padrão da plataforma
                aparecem como opção nas cobranças.
              </p>
            )}
            {myPlans.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(p.price_cents)} / {p.duration_months} {p.duration_months === 1 ? "mês" : "meses"}
                    {!p.is_active && " · inativo"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(p)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {p.is_active && (
                    <Button size="icon" variant="ghost" onClick={() => remove(p)}>
                      <ShieldOff className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" onClick={startNew} className="w-full gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo plano
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar Plano" : "Novo Plano"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Consultoria Elite"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input
                    value={editing.amount}
                    onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                    placeholder="0,00"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Duração (meses)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.duration_months}
                    onChange={(e) => setEditing({ ...editing, duration_months: e.target.value })}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Benefícios (um por linha)</Label>
                <Textarea
                  value={editing.benefits}
                  onChange={(e) => setEditing({ ...editing, benefits: e.target.value })}
                  rows={3}
                  className="mt-1 text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ativo</Label>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
              <Button onClick={save} disabled={savePlan.isPending} className="w-full">
                {savePlan.isPending ? "Salvando..." : "Salvar Plano"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PlanCatalogManager;