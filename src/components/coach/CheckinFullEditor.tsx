/**
 * CheckinFullEditor.tsx — Editor completo do último check-in do aluno,
 * usado pelo coach. Edita todas as seções de CHECKIN_SECTIONS, métricas,
 * fotos e o feedback do coach.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/student/FormField";
import { CHECKIN_METRICS, CHECKIN_SECTIONS } from "@/lib/checkInSchema";
import { uploadToCloudinary } from "@/lib/anamnesisSchema";
import { toast } from "sonner";
import { Loader2, Save, Upload } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const PHOTO_SLOTS: Array<{ key: string; label: string }> = [
  { key: "frente", label: "Frente" },
  { key: "costas", label: "Costas" },
  { key: "lateral_dir", label: "Lateral Dir." },
  { key: "lateral_esq", label: "Lateral Esq." },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  onSaved?: () => void;
}

export default function CheckinFullEditor({ open, onOpenChange, studentId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data: row } = await sb
        .from("check_ins")
        .select("id, payload, current_metrics, coach_feedback")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) {
        toast.error("Nenhum check-in encontrado para este aluno.");
        onOpenChange(false);
        return;
      }
      const p = (row.payload || {}) as Record<string, unknown>;
      setRowId(row.id);
      setData(p);
      const mraw = (p.metrics_raw as Record<string, string>) || {};
      const m: Record<string, string> = { ...mraw };
      const cm = (row.current_metrics || {}) as Record<string, number>;
      CHECKIN_METRICS.forEach((it) => {
        if (typeof cm[it.key] === "number") m[`cur_${it.key}`] = String(cm[it.key]);
      });
      setMetrics(m);
      setFotos((p.fotos as Record<string, string>) || {});
      setFeedback((row.coach_feedback as string) || "");
      setLoading(false);
    })();
  }, [open, studentId, onOpenChange]);

  async function handlePhoto(slot: string, file: File) {
    setUploadingKey(slot);
    try {
      const url = await uploadToCloudinary(file);
      setFotos((p) => ({ ...p, [slot]: url }));
      toast.success(`Foto ${slot} enviada`);
    } catch {
      toast.error("Falha ao enviar foto");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleSave() {
    if (!rowId) return;
    setSaving(true);
    try {
      const current_metrics: Record<string, number> = {};
      CHECKIN_METRICS.forEach((m) => {
        const v = parseFloat(String(metrics[`cur_${m.key}`] ?? "").replace(",", "."));
        if (!isNaN(v)) current_metrics[m.key] = v;
      });
      const payload = { ...data, metrics_raw: metrics, fotos };
      const { error } = await sb
        .from("check_ins")
        .update({
          payload,
          current_metrics,
          coach_feedback: feedback || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId);
      if (error) throw error;
      toast.success("Check-in atualizado.");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogTitle>Editar check-in completo</DialogTitle>
        <DialogDescription>
          Ajuste qualquer informação enviada pelo aluno, incluindo medidas, respostas, fotos e o feedback.
        </DialogDescription>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            {/* Métricas atuais */}
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Medidas atuais</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {CHECKIN_METRICS.map((m) => (
                  <div key={m.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{m.label} ({m.unit})</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={metrics[`cur_${m.key}`] ?? ""}
                      onChange={(e) =>
                        setMetrics((p) => ({ ...p, [`cur_${m.key}`]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Seções de feedback do aluno */}
            {CHECKIN_SECTIONS.map((sec) => (
              <section key={sec.id} className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{sec.title}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {sec.fields.map((f) => (
                    <div key={f.key} className={f.half ? "col-span-1" : "col-span-2"}>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</Label>
                      <FormField
                        field={f}
                        value={data[f.key]}
                        onChange={(v) => setData((p) => ({ ...p, [f.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Fotos */}
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Fotos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PHOTO_SLOTS.map((s) => (
                  <label key={s.key} className="block cursor-pointer space-y-1">
                    <div className="aspect-[3/4] rounded-lg border border-border bg-muted/20 overflow-hidden flex items-center justify-center relative">
                      {fotos[s.key] ? (
                        <img src={fotos[s.key]} alt={s.label} className="w-full h-full object-cover" />
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
            </section>

            {/* Feedback do coach */}
            <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
                Retorno do Coach (visível para o aluno)
              </h3>
              <Textarea
                rows={4}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Escreva seu feedback completo para esta quinzena…"
              />
            </section>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Salvar check-in
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}