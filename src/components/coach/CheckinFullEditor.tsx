/**
 * CheckinFullEditor.tsx — Editor completo do último check-in do aluno,
 * usado pelo coach. Edita todas as seções de CHECKIN_SECTIONS, métricas,
 * fotos e o feedback do coach.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/student/FormField";
import { CHECKIN_METRICS, CHECKIN_SECTIONS } from "@/lib/checkInSchema";
import { uploadToCloudinary, isFieldVisible } from "@/lib/anamnesisSchema";
import type { FieldRenderContext } from "@/lib/anamnesisSchema";
import { toast } from "sonner";
import { Loader2, Save, Upload, FileText, Trash2 } from "lucide-react";

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
  const [checkins, setCheckins] = useState<Array<{ id: string; submitted_at: string }>>([]);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [fotos, setFotos] = useState<Record<string, string>>({});
  type ExameItem = { url: string; nome?: string; tamanho_kb?: number; enviado_em?: string };
  const [exames, setExames] = useState<ExameItem[]>([]);
  const [feedback, setFeedback] = useState<string>("");
  const [reaction, setReaction] = useState<string | null>(null);
  // Referência da anamnese: alimenta os campos condicionais (gênero, protocolo
  // ativo) exatamente como no formulário do aluno.
  const [anamnesisPayload, setAnamnesisPayload] = useState<Record<string, unknown>>({});
  // [FIX] Guarda o updated_at carregado, para detectar se o registro mudou
  // (edição do aluno, ou o painel rápido de feedback) enquanto este editor
  // ficou aberto — sem isto, o Salvar sobrescreve tudo às cegas.
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      sb.from("anamnesis")
        .select("payload")
        .eq("student_id", studentId)
        .maybeSingle()
        .then(({ data: a }: { data: { payload?: Record<string, unknown> } | null }) =>
          setAnamnesisPayload((a?.payload as Record<string, unknown>) ?? {})
        );
      const { data: rows } = await sb
        .from("check_ins")
        .select("id, submitted_at")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false });
      const list = (rows || []) as Array<{ id: string; submitted_at: string }>;
      setCheckins(list);
      if (list.length === 0) {
        toast.error("Nenhum check-in encontrado para este aluno.");
        setLoading(false);
        onOpenChange(false);
        return;
      }
      setRowId(list[0].id);
    })();
  }, [open, studentId, onOpenChange]);

  const fieldCtx: FieldRenderContext = useMemo(
    () => ({ reference: anamnesisPayload, answers: data }),
    [anamnesisPayload, data]
  );

  // Load the selected check-in's full data whenever rowId changes
  useEffect(() => {
    if (!open || !rowId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: row } = await sb
        .from("check_ins")
        .select("id, payload, current_metrics, coach_feedback, coach_reaction, updated_at")
        .eq("id", rowId)
        .maybeSingle();
      if (cancelled || !row) { setLoading(false); return; }
      const p = (row.payload || {}) as Record<string, unknown>;
      setData(p);
      const mraw = (p.metrics_raw as Record<string, string>) || {};
      const m: Record<string, string> = { ...mraw };
      const cm = (row.current_metrics || {}) as Record<string, number>;
      CHECKIN_METRICS.forEach((it) => {
        if (typeof cm[it.key] === "number") m[`cur_${it.key}`] = String(cm[it.key]);
      });
      setMetrics(m);
      setFotos((p.fotos as Record<string, string>) || {});
      const ex = (p.exames as ExameItem[]) || [];
      setExames(Array.isArray(ex) ? ex : []);
      setFeedback((row.coach_feedback as string) || "");
      setReaction((row.coach_reaction as string) || null);
      setLoadedUpdatedAt((row.updated_at as string) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, rowId]);

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
      const payload = { ...data, metrics_raw: metrics, fotos, exames };

      // [FIX] Só grava se updated_at ainda for o mesmo de quando este editor
      // carregou o registro. Se mudou (edição do aluno ou outra tela), NÃO
      // sobrescrevemos — avisamos o coach em vez de perder o dado novo.
      let query = sb
        .from("check_ins")
        .update({
          payload,
          current_metrics,
          coach_feedback: feedback || null,
          coach_reaction: reaction || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rowId);
      if (loadedUpdatedAt) {
        query = query.eq("updated_at", loadedUpdatedAt);
      }
      const { data: savedRows, error } = await query.select("id");
      if (error) throw error;

      if (!savedRows || savedRows.length === 0) {
        toast.error(
          "Este check-in foi alterado (pelo aluno ou em outra tela) enquanto você editava. Nada foi sobrescrito — feche e reabra o editor para ver a versão mais recente antes de salvar de novo.",
          { duration: 12000 }
        );
        return;
      }

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
            {/* Seletor de check-in */}
            {checkins.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Check-in a editar</Label>
                <Select value={rowId ?? ""} onValueChange={(v) => setRowId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um check-in" />
                  </SelectTrigger>
                  <SelectContent>
                    {checkins.map((c, i) => (
                      <SelectItem key={c.id} value={c.id}>
                        {new Date(c.submitted_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {i === 0 ? " (mais recente)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
            {CHECKIN_SECTIONS.map((sec) => {
              const visibleFields = sec.fields.filter((f) => isFieldVisible(f, fieldCtx));
              if (visibleFields.length === 0) return null;
              return (
              <section key={sec.id} className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{sec.title}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {visibleFields.map((f) => (
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
              );
            })}

            {/* Fotos */}
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Fotos</h3>
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
            </section>

            {/* Exames (PDF) — só permite remover; upload é feito pelo aluno */}
            {exames.length > 0 && (
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Exames (PDF)</h3>
                <div className="space-y-2">
                  {exames.map((ex, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-lg px-3 py-2">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <a href={ex.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
                        {ex.nome || `Exame ${i + 1}`}
                      </a>
                      {typeof ex.tamanho_kb === "number" && (
                        <span className="text-muted-foreground text-[10px]">{ex.tamanho_kb}KB</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExames((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover exame"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Feedback do coach */}
            <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
                Retorno do Coach (visível para o aluno)
              </h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Reação rápida
                </span>
                {["💪", "🔥", "👏"].map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setReaction((prev) => (prev === e ? null : e))}
                    className={`w-9 h-9 rounded-full border text-lg leading-none transition-all ${
                      reaction === e
                        ? "bg-primary/20 border-primary scale-110"
                        : "border-border hover:border-primary/40"
                    }`}
                    aria-pressed={reaction === e}
                    aria-label={`Reagir com ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
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
