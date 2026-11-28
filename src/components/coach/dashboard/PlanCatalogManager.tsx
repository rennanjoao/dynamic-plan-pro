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

type Kind = "coaching" | "access" | "one_off";

const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: "coaching", label: "Consultoria", hint: "Acompanhamento completo. Desconto de parceria vale no trimestral/semestral." },
  { value: "access", label: "Só acesso", hint: "Mantém o app e os check-ins, sem alertas de acompanhamento para você." },
  { value: "one_off", label: "Avulso", hint: "Cobrança única (ex.: ajuste pontual). Não muda o período do plano." },
];
const KIND_SHORT: Record<Kind, string> = { coaching: "Consultoria", access: "Só acesso", one_off: "Avulso" };

/** Modelos prontos: o coach só confere e salva. */
const PRESETS: { kind: Kind; name: string; amount: string; description: string }[] = [
  { kind: "access", name: "Acesso à plataforma", amount: "69,90", description: "Continua usando o app e fazendo check-ins, sem ajustes nem acompanhamento." },
  { kind: "one_off", name: "Ajuste pontual", amount: "250,00", description: "Um ajuste no treino e nas orientações, quando você quiser." },
];

function kindOf(p: { kind?: string | null }): Kind {
  return p.kind === "access" || p.kind === "one_off" ? p.kind : "coaching";
}

interface PlanForm {
  id?: string;
  kind: Kind;
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
  kind: "coaching",
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
  const startPreset = (preset: (typeof PRESETS)[number]) =>
    setEditing({ ...emptyForm, kind: preset.kind, name: preset.name, amount: preset.amount, description: preset.description });
  const missingPresets = PRESETS.filter((pr) => !myPlans.some((p) => p.is_active && kindOf(p) === pr.kind));
  const startEdit = (p: StudentPlan) =>
    setEditing({
      id: p.id,
      kind: kindOf(p),
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
    const duration_months = editing.kind === "one_off" ? 1 : Number(editing.duration_months) || 1;
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
        kind: editing.kind,
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
                    {KIND_SHORT[kindOf(p)]} · {formatCents(p.price_cents)}
                    {kindOf(p) === "one_off" ? "" : ` / ${p.duration_months} ${p.duration_months === 1 ? "mês" : "meses"}`}
                    {!p.is_active && " · inativo"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button aria-label="Editar plano" size="icon" variant="ghost" onClick={() => startEdit(p)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {p.is_active && (
                    <Button aria-label="Desativar plano" size="icon" variant="ghost" onClick={() => remove(p)}>
                      <ShieldOff className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {missingPresets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Sugestões</p>
              <div className="flex flex-wrap gap-2">
                {missingPresets.map((pr) => (
                  <Button key={pr.kind} size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => startPreset(pr)}>
                    <Plus className="w-3 h-3" aria-hidden="true" /> {pr.name} · R$ {pr.amount}{pr.kind === "access" ? "/mês" : ""}
                  </Button>
                ))}
              </div>
            </div>
          )}
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
                <Label className="text-xs" id="plan-kind-label">Tipo</Label>
                <div role="radiogroup" aria-labelledby="plan-kind-label" className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {KIND_OPTIONS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      role="radio"
                      aria-checked={editing.kind === k.value}
                      onClick={() => setEditing({ ...editing, kind: k.value })}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        editing.kind === k.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{KIND_OPTIONS.find((k) => k.value === editing.kind)?.hint}</p>
              </div>
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Consultoria Elite"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className={`grid gap-3 ${editing.kind === "one_off" ? "grid-cols-1" : "grid-cols-2"}`}>
                <div>
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input
                    value={editing.amount}
                    onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                    placeholder="0,00"
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                {editing.kind !== "one_off" && (
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
                )}
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