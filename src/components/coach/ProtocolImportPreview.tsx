/**
 * ProtocolImportPreview.tsx
 *
 * Tela de Preview/Diff do estágio `PREVIEW` da máquina de estados de
 * importação. Mostra um resumo determinístico do que será gravado e
 * permite ao Coach:
 *   - Confirmar a importação (avança para COMMITTING).
 *   - Cancelar/Voltar (limpa estado).
 *   - Exportar JSON Corrigido (download do payload já validado).
 *
 * Recebe um clone profundo do payload — não muta nada.
 */

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, CheckCircle2, X, AlertTriangle } from "lucide-react";
import type { ProtocolPayload } from "@/lib/protocolSchema";

interface Props {
  open: boolean;
  payload: ProtocolPayload | null;
  fileName: string;
  hadAnomalies: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

interface Summary {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  workouts: number;
  exercises: number;
  meals: number;
  items: { carb: number; protein: number; fat: number; veg: number; other: number };
}

function summarize(p: ProtocolPayload | null): Summary {
  const s: Summary = {
    kcal: 0, protein: 0, carb: 0, fat: 0,
    workouts: 0, exercises: 0, meals: 0,
    items: { carb: 0, protein: 0, fat: 0, veg: 0, other: 0 },
  };
  if (!p) return s;

  const macros: any = (p as any).macros || {};
  s.kcal    = Number(macros.kcal ?? macros.calories ?? 0) || 0;
  s.protein = Number(macros.protein ?? 0) || 0;
  s.carb    = Number(macros.carb ?? macros.carbs ?? 0) || 0;
  s.fat     = Number(macros.fat ?? 0) || 0;

  const workouts: any[] = Array.isArray((p as any).workouts) ? (p as any).workouts : [];
  s.workouts = workouts.length;
  s.exercises = workouts.reduce((acc, w) => acc + (Array.isArray(w?.exercises) ? w.exercises.length : 0), 0);

  const meals: any[] = Array.isArray((p as any).meals) ? (p as any).meals : [];
  s.meals = meals.length;
  for (const m of meals) {
    for (const opt of (m?.options || [])) {
      const bucket = (s.items as any)[opt?.kind] != null ? opt.kind : "other";
      const count = Array.isArray(opt?.items) ? opt.items.length : 0;
      (s.items as any)[bucket] += count;
    }
  }
  return s;
}

function downloadCorrectedJson(payload: ProtocolPayload, fileName: string) {
  const safeBase = (fileName || "protocolo").replace(/\.json$/i, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const blob = new Blob([JSON.stringify({ payload }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeBase || "protocolo"}-corrigido.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ProtocolImportPreview({ open, payload, fileName, hadAnomalies, onCancel, onConfirm }: Props) {
  const summary = useMemo(() => summarize(payload), [payload]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Pré-visualização da Importação
          </DialogTitle>
          <DialogDescription>
            Revise o que será gravado. Nada é persistido até você confirmar.
          </DialogDescription>
        </DialogHeader>

        {hadAnomalies && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            Itens foram corrigidos manualmente na etapa anterior. O JSON exportado já reflete essas correções.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Calorias / Macros</div>
              <div className="text-2xl font-semibold">{summary.kcal} kcal</div>
              <div className="text-xs text-muted-foreground">
                P {summary.protein}g · C {summary.carb}g · G {summary.fat}g
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Treinos</div>
              <div className="text-2xl font-semibold">{summary.workouts}</div>
              <div className="text-xs text-muted-foreground">{summary.exercises} exercícios no total</div>
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Refeições</div>
                <div className="text-lg font-semibold">{summary.meals}</div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Carbo: {summary.items.carb}</Badge>
                <Badge variant="secondary">Proteína: {summary.items.protein}</Badge>
                <Badge variant="secondary">Gordura: {summary.items.fat}</Badge>
                {summary.items.veg > 0 && <Badge variant="secondary">Vegetal: {summary.items.veg}</Badge>}
                {summary.items.other > 0 && <Badge variant="outline">Outros: {summary.items.other}</Badge>}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" type="button" onClick={onCancel}>
            <X className="w-4 h-4 mr-1.5" /> Cancelar
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={!payload}
            onClick={() => payload && downloadCorrectedJson(payload, fileName)}
            title="Baixar JSON validado e corrigido"
          >
            <Download className="w-4 h-4 mr-1.5" /> Exportar JSON Corrigido
          </Button>
          <Button type="button" disabled={!payload} onClick={onConfirm}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" /> Confirmar Importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}