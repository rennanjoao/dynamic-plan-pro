import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ChevronDown, Trash2, Plus, Sparkles, Pill } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProtocolPayload, SUPPLEMENT_OBJECTIVES } from "@/lib/protocolSchema";

/**
 * GuidelinesTab + SupplementsSection — extraídos de ProtocolBuilder.tsx
 * sem qualquer mudança de comportamento. Mantidos juntos por acoplamento direto
 * (SupplementsSection é renderizado dentro do GuidelinesTab).
 */
export function GuidelinesTab({ payload, setPayload, coachId = null }: { payload: ProtocolPayload; setPayload: (p: ProtocolPayload) => void; coachId?: string | null }) {
  const upd = (k: keyof ProtocolPayload["guidelines"], v: string) => setPayload({ ...payload, guidelines: { ...payload.guidelines, [k]: v } });
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    training: false, diet: false, weekOrganization: false, supplementation: false,
  });
  const toggle = (k: string) => setOpenMap((m) => ({ ...m, [k]: !m[k] }));
  const blocks: Array<{ k: keyof ProtocolPayload["guidelines"]; label: string; emoji: string; hint?: string; minH: string }> = [
    { k: "training",         label: "Diretrizes de treino", emoji: "🏋️", hint: "Regras gerais (foco, intensidade, falha, descanso)", minH: "min-h-[100px]" },
    { k: "diet",             label: "Diretrizes da dieta",  emoji: "🍽️", hint: "Hidratação, sal, fibras, suplementos com refeições",  minH: "min-h-[100px]" },
    { k: "weekOrganization", label: "Organização da semana", emoji: "📅", hint: "Ex.: Seg/Qua/Sex carbo alto · Ter/Qui/Sab/Dom carbo baixo", minH: "min-h-[80px]" },
    { k: "supplementation",  label: "Sono", emoji: "🌙", hint: "Rotina, duração, qualidade e higiene do sono", minH: "min-h-[100px]" },
  ];
  const showToStudent: boolean = (payload as any).showGuidelines ?? false;
  const setShowToStudent = (v: boolean) => setPayload({ ...payload, showGuidelines: v } as any);
  return (
    <Card className="bg-card/60 border-border p-4 space-y-4">
      {/* Templates de diretrizes: salvar as atuais / aplicar em qualquer aluno */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-muted-foreground">Biblioteca de diretrizes</p>
        <GuidelinesTemplateQuickPicker payload={payload} setPayload={setPayload} coachId={coachId} />
      </div>

      {/* Controle de visibilidade para o aluno */}
      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold">Exibir Diretrizes para o aluno</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Quando ativo, o aluno verá as diretrizes e a Regra de Ouro no Plano de Treino, com o card "Diretrizes" piscando em verde.</p>
        </div>
        <Switch checked={showToStudent} onCheckedChange={setShowToStudent} />
      </div>

      {blocks.map((b) => {
        const isOpen = openMap[b.k as string] ?? true;
        const val = (payload.guidelines[b.k] ?? "") as string;
        const preview = val.trim().slice(0, 80);
        return (
          <div key={b.k as string} className="border border-border/40 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(b.k as string)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold">{b.label}</p>
                {!isOpen && preview && (
                  <p className="text-[10px] text-muted-foreground truncate">{preview}{val.length > 80 ? "…" : ""}</p>
                )}
                {!isOpen && !preview && (
                  <p className="text-[10px] text-muted-foreground italic">vazio</p>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="p-3 space-y-1">
                {b.hint && <p className="text-[10px] text-muted-foreground">{b.hint}</p>}
                <Textarea
                  value={val}
                  onChange={(e) => upd(b.k, e.target.value)}
                  className={cn(b.minH, "text-sm")}
                />
              </div>
            )}
          </div>
        );
      })}
      <SupplementsSection payload={payload} setPayload={setPayload} />
    </Card>
  );
}

// ─── SupplementsSection ──────────────────────────────────────────────────────

function SupplementsSection({
  payload,
  setPayload,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
}) {
  const supplements = payload.supplements ?? [];
  const combos = payload.supplementCombos ?? [];

  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [comboName, setComboName] = useState("");
  const [comboTiming, setComboTiming] = useState("Outro");
  const [comboPicks, setComboPicks] = useState<Set<number>>(new Set());

  // Índices já usados em algum combo (para exibir separado)
  const boundSet = new Set<number>();
  combos.forEach((c) => (c.supplementIndexes || []).forEach((i) => boundSet.add(i)));
  const unboundIndexes = supplements
    .map((_, i) => i)
    .filter((i) => !boundSet.has(i));

  const setSupplements = (next: typeof supplements) =>
    setPayload({ ...payload, supplements: next });

  const setCombos = (next: typeof combos) =>
    setPayload({ ...payload, supplementCombos: next });

  const updSupp = (si: number, patch: Partial<(typeof supplements)[number]>) => {
    const n = [...supplements];
    n[si] = { ...n[si], ...patch };
    setSupplements(n);
  };

  const addSupplement = () =>
    setSupplements([
      ...supplements,
      { name: "", dose: "", timing: "", notes: "", mealRef: "", objective: "outro" },
    ]);

  const removeSupplement = (si: number) => {
    const nextSupps = supplements.filter((_, j) => j !== si);
    // Remapear índices dos combos: remove o que sumiu; decrementa os maiores.
    const nextCombos = combos
      .map((c) => ({
        ...c,
        supplementIndexes: (c.supplementIndexes || [])
          .filter((i) => i !== si)
          .map((i) => (i > si ? i - 1 : i)),
      }))
      .filter((c) => (c.supplementIndexes || []).length > 0);
    setPayload({
      ...payload,
      supplements: nextSupps,
      supplementCombos: nextCombos,
    });
  };

  const openComboDialog = () => {
    setComboName("");
    setComboTiming("Outro");
    setComboPicks(new Set());
    setComboDialogOpen(true);
  };

  const togglePick = (i: number) => {
    setComboPicks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const confirmCombo = () => {
    if (comboPicks.size < 2) {
      toast.error("Selecione ao menos 2 suplementos para formar um combo.");
      return;
    }
    if (!comboName.trim()) {
      toast.error("Dê um nome ao combo.");
      return;
    }
    setCombos([
      ...combos,
      {
        name: comboName.trim(),
        timing: comboTiming,
        supplementIndexes: Array.from(comboPicks).sort((a, b) => a - b),
      },
    ]);
    setComboDialogOpen(false);
  };

  const removeCombo = (ci: number) => {
    // Desfaz o combo — os suplementos voltam a aparecer soltos.
    setCombos(combos.filter((_, j) => j !== ci));
  };

  const updCombo = (ci: number, patch: Partial<(typeof combos)[number]>) => {
    const n = [...combos];
    n[ci] = { ...n[ci], ...patch };
    setCombos(n);
  };

  const TIMING_OPTIONS = [
    "Ao acordar (jejum)", "Pré-treino", "Intra-treino", "Pós-treino",
    "Com refeição", "Antes de dormir", "Outro",
  ];

  // Dias da semana para itens de categoria "hormonio_manipulado" — onde a
  // lista de horários de refeição (TIMING_OPTIONS) não faz sentido.
  const WEEKDAYS = [
    { key: "seg", label: "Seg" }, { key: "ter", label: "Ter" }, { key: "qua", label: "Qua" },
    { key: "qui", label: "Qui" }, { key: "sex", label: "Sex" }, { key: "sab", label: "Sáb" },
    { key: "dom", label: "Dom" },
  ];

  const renderSupplementCard = (si: number) => {
    const s = supplements[si];
    if (!s) return null;
    const category = ((s as any).category as string) || "suplemento";
    const isHormone = category === "hormonio_manipulado";
    const weekly: string[] = ((s as any).weeklyFrequency as string[]) || [];
    const toggleDay = (d: string) =>
      updSupp(si, {
        weeklyFrequency: weekly.includes(d) ? weekly.filter((x) => x !== d) : [...weekly, d],
      } as any);
    return (
      <Card key={si} className="bg-card/60 border-border p-3">
        <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
          <Input
            value={s.name}
            onChange={(e) => updSupp(si, { name: e.target.value })}
            placeholder="Nome"
            className="h-8 text-xs"
          />
          <button
            onClick={() => removeSupplement(si)}
            className="text-muted-foreground hover:text-destructive p-1.5"
            title="Remover suplemento"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={s.dose}
            onChange={(e) => updSupp(si, { dose: e.target.value })}
            placeholder="Dose"
            className="h-8 text-xs"
          />
          <Select
            value={category}
            onValueChange={(v) => updSupp(si, { category: v } as any)}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="suplemento" className="text-xs">Suplemento</SelectItem>
              <SelectItem value="hormonio_manipulado" className="text-xs">Hormônio ou manipulado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          {isHormone ? (
            <>
              <Label className="text-[10px] text-muted-foreground">Dias da semana</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                      weekly.includes(d.key)
                        ? "bg-primary/15 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Select value={s.timing || "Outro"} onValueChange={(v) => updSupp(si, { timing: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMING_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-2 mt-2">
          <Select
            value={(s as any).mealRef || "__none__"}
            onValueChange={(v) => updSupp(si, { mealRef: v === "__none__" ? "" : v } as any)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Vincular à refeição (opcional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">— sem refeição —</SelectItem>
              {(payload.meals ?? []).map((mm, mi) => (
                <SelectItem key={mi} value={mm.name || `Refeição ${mi + 1}`} className="text-xs">
                  {mm.name || `Refeição ${mi + 1}`}{mm.time ? ` (${mm.time})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={s.notes}
            onChange={(e) => updSupp(si, { notes: e.target.value })}
            placeholder="Ex.: 30 min após a refeição"
            className="h-8 text-xs"
          />
        </div>
        <div className="mt-2">
          <Label className="text-[10px] text-muted-foreground">Objetivo</Label>
          <Select
            value={(s as any).objective || "outro"}
            onValueChange={(v) => updSupp(si, { objective: v as any } as any)}
          >
            <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPLEMENT_OBJECTIVES.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
    );
  };

  return (
    <div className="border-t border-border/40 pt-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          <Pill className="w-4 h-4 text-primary" /> Suplementos prescritos
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={openComboDialog}
            disabled={unboundIndexes.length < 2}
            title={unboundIndexes.length < 2 ? "Cadastre ao menos 2 suplementos livres" : "Agrupar suplementos em um combo"}
          >
            <Sparkles className="w-3 h-3 mr-1" /> Criar combo
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addSupplement}>
            <Plus className="w-3 h-3 mr-1" /> Suplemento
          </Button>
        </div>
      </div>

      {supplements.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border/40 rounded-lg">
          Nenhum suplemento cadastrado.
        </p>
      )}

      {/* Combos */}
      {combos.map((c, ci) => (
        <Card key={`combo-${ci}`} className="bg-primary/5 border-primary/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={c.name}
              onChange={(e) => updCombo(ci, { name: e.target.value })}
              placeholder="Nome do combo (ex.: Combo Manhã)"
              className="h-8 text-xs font-semibold"
            />
            <Select value={c.timing || "Outro"} onValueChange={(v) => updCombo(ci, { timing: v })}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMING_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => removeCombo(ci)}
              className="text-muted-foreground hover:text-destructive p-1.5"
              title="Desfazer combo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-primary/30">
            {(c.supplementIndexes || []).map((si) => renderSupplementCard(si))}
          </div>
        </Card>
      ))}

      {/* Suplementos soltos */}
      {unboundIndexes.map((si) => renderSupplementCard(si))}

      {/* Dialog: criar combo */}
      <Dialog open={comboDialogOpen} onOpenChange={setComboDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Criar combo de suplementos</DialogTitle>
            <DialogDescription className="text-xs">
              Agrupe 2 ou mais suplementos com um horário/momento único.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome do combo</Label>
              <Input
                value={comboName}
                onChange={(e) => setComboName(e.target.value)}
                placeholder="Ex.: Combo Manhã"
                className="h-9 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Horário/momento</Label>
              <Select value={comboTiming} onValueChange={setComboTiming}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMING_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Suplementos ({comboPicks.size} selecionado{comboPicks.size === 1 ? "" : "s"})</Label>
              <div className="mt-1 max-h-56 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                {unboundIndexes.length === 0 && (
                  <p className="text-xs italic text-muted-foreground py-2 text-center">
                    Nenhum suplemento livre disponível.
                  </p>
                )}
                {unboundIndexes.map((i) => {
                  const s = supplements[i];
                  return (
                    <label
                      key={i}
                      className="flex items-start gap-2 text-xs py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={comboPicks.has(i)}
                        onChange={() => togglePick(i)}
                        className="accent-primary mt-0.5 shrink-0"
                      />
                      <span className="flex-1 min-w-0 whitespace-pre-wrap break-words">
                        {s.name || <span className="italic text-muted-foreground">(sem nome)</span>}
                        {s.dose ? <span className="text-muted-foreground"> — {s.dose}</span> : null}
                      </span>
                    </label>

                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setComboDialogOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmCombo}>
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Criar combo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GuidelinesTab;
