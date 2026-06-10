/**
 * ProtocolImportResolverModal.tsx
 *
 * UI de "Resolução de Importação". Aparece automaticamente quando a camada
 * de validação detecta orphan data no JSON importado. O Coach pode:
 *  - Definir manualmente a categoria (carb/protein/fat) de uma opção sem kind.
 *  - Renomear strings quebradas de itens/exercícios.
 *  - Descartar entradas que não fazem sentido.
 *
 * Só após confirmar o commit é que o payload final é injetado na UI principal.
 */

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Trash2, Wand2 } from "lucide-react";
import type { ImportAnomaly, Resolution } from "@/lib/protocolImportValidator";

interface Props {
  open: boolean;
  anomalies: ImportAnomaly[];
  onCancel: () => void;
  onConfirm: (resolutions: Record<string, Resolution>) => void;
}

const KIND_LABEL: Record<string, string> = {
  carb: "Carboidrato",
  protein: "Proteína",
  fat: "Gordura",
};

const SECTION_LABEL: Record<string, string> = {
  "option-missing-kind": "Opções sem categoria definida",
  "option-empty-items":  "Opções sem itens válidos",
  "item-broken":         "Itens com nome quebrado ou vazio",
  "workout-broken":      "Exercícios sem nome",
};

export default function ProtocolImportResolverModal({ open, anomalies, onCancel, onConfirm }: Props) {
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});

  const grouped = useMemo(() => {
    const g: Record<string, ImportAnomaly[]> = {};
    for (const a of anomalies) {
      (g[a.kind] ||= []).push(a);
    }
    return g;
  }, [anomalies]);

  const setRes = (id: string, r: Resolution) =>
    setResolutions((prev) => ({ ...prev, [id]: r }));

  const allResolved = anomalies.every((a) => !!resolutions[a.id]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Resolução de Importação
          </DialogTitle>
          <DialogDescription>
            Encontramos {anomalies.length} item(ns) que não encaixaram no modelo da plataforma.
            Vincule manualmente antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {Object.entries(grouped).map(([sectionKey, items]) => (
            <section key={sectionKey} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                {SECTION_LABEL[sectionKey] || sectionKey} ({items.length})
              </h3>
              <div className="space-y-2">
                {items.map((a) => (
                  <AnomalyRow
                    key={a.id}
                    anomaly={a}
                    resolution={resolutions[a.id]}
                    onChange={(r) => setRes(a.id, r)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} type="button">
            Cancelar importação
          </Button>
          <Button
            onClick={() => onConfirm(resolutions)}
            disabled={!allResolved}
            type="button"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Confirmar e importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnomalyRow({
  anomaly, resolution, onChange,
}: {
  anomaly: ImportAnomaly;
  resolution?: Resolution;
  onChange: (r: Resolution) => void;
}) {
  const needsKind = anomaly.kind === "option-missing-kind";
  const needsRename = anomaly.kind === "item-broken" || anomaly.kind === "workout-broken";
  const onlyDiscard = anomaly.kind === "option-empty-items";

  const currentName =
    (anomaly.rawValue?.name ?? anomaly.rawValue?.baseName ?? anomaly.rawValue?.title ?? "") as string;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">{anomaly.reason}</p>

      {needsKind && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground/80">Para onde vai esta opção?</span>
          <Select
            value={resolution?.type === "set-kind" ? resolution.kind : ""}
            onValueChange={(v) => onChange({ type: "set-kind", kind: v as any })}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Categoria…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carb">{KIND_LABEL.carb}</SelectItem>
              <SelectItem value="protein">{KIND_LABEL.protein}</SelectItem>
              <SelectItem value="fat">{KIND_LABEL.fat}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {needsRename && (
        <div className="flex items-center gap-2">
          <Input
            className="h-8"
            placeholder="Corrigir nome…"
            defaultValue={currentName}
            onChange={(e) => onChange({ type: "rename-item", name: e.target.value })}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {resolution
            ? resolution.type === "discard"
              ? "Será descartado"
              : resolution.type === "set-kind"
                ? `Categoria: ${KIND_LABEL[resolution.kind]}`
                : `Renomear para: ${resolution.name || "—"}`
            : "Pendente"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-destructive hover:text-destructive"
          onClick={() => onChange({ type: "discard" })}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          {onlyDiscard ? "Remover" : "Descartar"}
        </Button>
      </div>
    </div>
  );
}