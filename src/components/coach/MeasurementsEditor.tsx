/**
 * MeasurementsEditor.tsx — Permite ao coach ajustar medidas corporais
 * (e fotos) tanto da Anamnese quanto do Check-in mais recente do aluno.
 *
 * CORREÇÃO: campos de braço padronizados para:
 *   Braço D Relaxado / Braço E Relaxado / Braço D Contraído / Braço E Contraído
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, Upload } from "lucide-react";
import { BASELINE_KEYS, uploadToCloudinary } from "@/lib/anamnesisSchema";
import { estimateBF } from "@/lib/bfEstimate";
import BFDisplay from "@/components/shared/BFDisplay";
import { PrivateImg, PrivateField, Private } from "@/components/coach/PrivacyMode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const FIELDS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "altura",           label: "Altura",             unit: "cm" },
  { key: "peso",             label: "Peso",               unit: "kg" },
  { key: "pescoco",          label: "Pescoço",            unit: "cm" },
  { key: "cintura",          label: "Cintura",            unit: "cm" },
  { key: "quadril",          label: "Quadril",            unit: "cm" },
  // ── braços padronizados ──────────────────────────────────────────
  { key: "braco_d_relaxado",  label: "Braço D Relaxado",  unit: "cm" },
  { key: "braco_e_relaxado",  label: "Braço E Relaxado",  unit: "cm" },
  { key: "braco_d_contraido", label: "Braço D Contraído", unit: "cm" },
  { key: "braco_e_contraido", label: "Braço E Contraído", unit: "cm" },
  // ────────────────────────────────────────────────────────────────
  { key: "coxa_d",           label: "Coxa D",             unit: "cm" },
  { key: "coxa_e",           label: "Coxa E",             unit: "cm" },
  { key: "pant_d",           label: "Panturrilha D",      unit: "cm" },
  { key: "pant_e",           label: "Panturrilha E",      unit: "cm" },
];

const PHOTO_SLOTS: Array<{ key: string; label: string }> = [
  { key: "frente",       label: "Frente" },
  { key: "costas",       label: "Costas" },
  { key: "lateral_dir",  label: "Lateral Dir." },
  { key: "lateral_esq",  label: "Lateral Esq." },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  target: "anamnesis" | "checkin";
  onSaved?: () => void;
}

export default function MeasurementsEditor({ open, onOpenChange, studentId, target, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [origPayload, setOrigPayload] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      let row: { id: string; payload: Record<string, unknown> } | null = null;
      if (target === "anamnesis") {
        const { data } = await sb.from("anamnesis").select("id, payload").eq("student_id", studentId).maybeSingle();
        row = data ?? null;
      } else {
        const { data } = await sb.from("check_ins").select("id, payload").eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
        row = data ?? null;
      }
      if (!row) {
        toast.error(target === "anamnesis" ? "Aluno ainda não preencheu anamnese." : "Nenhum check-in encontrado.");
        onOpenChange(false);
        return;
      }
      const p = (row.payload || {}) as Record<string, unknown>;
      setRowId(row.id);
      setOrigPayload(p);
      const v: Record<string, string> = {};
      for (const f of FIELDS) {
        // Migração retrocompatível: mapeia campos antigos para novos
        let raw = p[f.key];
        if (raw === undefined || raw === null) {
          if (f.key === "braco_d_relaxado")  raw = p["braco_d"] ?? p["arm_relaxed"];
          if (f.key === "braco_e_relaxado")  raw = p["braco_e"] ?? p["arm_relaxed"];
          if (f.key === "braco_d_contraido") raw = p["arm_flexed"];
          if (f.key === "braco_e_contraido") raw = p["arm_flexed"];
        }
        v[f.key] = raw === null || raw === undefined ? "" : String(raw);
      }
      setValues(v);
      setFotos((p.fotos as Record<string, string>) || {});
      setLoading(false);
    })();
  }, [open, target, studentId, onOpenChange]);

  async function handlePhoto(slot: string, file: File) {
    setUploadingKey(slot);
    try {
      const url = await uploadToCloudinary(file);
      setFotos((prev) => ({ ...prev, [slot]: url }));
      toast.success(`Foto ${slot} enviada`);
    } catch {
      toast.error("Falha ao enviar foto");
    } finally {
      setUploadingKey(null);
    }
  }

  const baseline = useMemo(() => {
    const b: Record<string, number> = {};
    for (const k of BASELINE_KEYS) {
      const n = parseFloat((values[k] ?? "").replace(",", "."));
      if (!isNaN(n)) b[k] = n;
    }
    return b;
  }, [values]);

  const bf = useMemo(() => {
    // O campo salvo na anamnese é "gender" (en-US: "F"/"M"). Mantemos os
    // fallbacks "genero"/"sexo" apenas por compatibilidade com payloads antigos.
    const genero = (origPayload.gender as string) || (origPayload.genero as string) || (origPayload.sexo as string) || "M";
    return estimateBF({
      altura: values.altura,
      cintura: values.cintura,
      pescoco: values.pescoco,
      quadril: values.quadril,
      genero,
    });
  }, [values, origPayload]);

  async function handleSave() {
    if (!rowId) return;
    setSaving(true);
    const merged: Record<string, unknown> = { ...origPayload, fotos };
    for (const f of FIELDS) {
      const raw = values[f.key]?.trim();
      if (raw === "" || raw === undefined) {
        delete merged[f.key];
      } else {
        const n = parseFloat(raw.replace(",", "."));
        merged[f.key] = isNaN(n) ? raw : n;
      }
    }
    // BF% nunca é persistido: é sempre recalculado a partir das medidas.
    delete merged.body_fat;
    const table = target === "anamnesis" ? "anamnesis" : "check_ins";
    const update: Record<string, unknown> = { payload: merged, updated_at: new Date().toISOString() };
    if (target === "anamnesis") update.baseline_metrics = baseline;
    else update.current_metrics = baseline;

    const { error } = await sb.from(table).update(update).eq("id", rowId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Medidas atualizadas");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogTitle>
          Editar medidas — {target === "anamnesis" ? "Anamnese (baseline)" : "Último check-in"}
        </DialogTitle>
        <DialogDescription>
          Ajuste os números informados pelo aluno e atualize fotos quando necessário.
        </DialogDescription>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            <PrivateField label="Revelar medidas para editar">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {f.label}{f.unit ? ` (${f.unit})` : ""}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
            </PrivateField>

            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">BF% estimado (automático)</Label>
                {bf.value != null ? (
                  <Private><BFDisplay value={bf.value} showLabel={false} /></Private>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
              {bf.value == null && bf.missing.length > 0 && (
                <p className="text-[11px] text-amber-500 mt-1">
                  Faltam para calcular: {bf.missing.join(", ")}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Calculado pela fórmula US Navy a partir das medidas acima.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Fotos</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PHOTO_SLOTS.map((s) => (
                  <label key={s.key} className="block cursor-pointer space-y-1">
                    <div className="aspect-[3/4] rounded-lg border border-border bg-muted/20 overflow-hidden flex items-center justify-center relative">
                      {fotos[s.key] ? (
                        <PrivateImg src={fotos[s.key]} alt={s.label} className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-5 h-5 text-muted-foreground" />
                      )}
                      {uploadingKey === s.key && (
                        <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-center text-muted-foreground">{s.label}</p>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhoto(s.key, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
