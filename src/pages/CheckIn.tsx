/**
 * CheckIn.tsx — Ficha de check-in quinzenal do aluno.
 * Cada submit cria um novo registro em public.check_ins.
 * Métricas atuais comparam contra `anamnesis.baseline_metrics`.
 *
 * ALTERAÇÃO: FotoSlot local removido e substituído por @/components/shared/FotoSlot
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CHECKIN_SECTIONS, CHECKIN_METRICS } from "@/lib/checkInSchema";
import { notifyCoach } from "@/lib/notifyCoach";
import { uploadToCloudinary } from "@/lib/anamnesisSchema";
import { FormField } from "@/components/student/FormField";
import { FotoSlot } from "@/components/shared/FotoSlot";
import { useStudentData } from "@/hooks/useStudentData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const FOTO_KEYS = ["frente", "lateral_dir", "lateral_esq", "costas"] as const;
const FOTO_LABELS: Record<string, string> = {
  frente: "Frente",
  lateral_dir: "Lateral Dir.",
  lateral_esq: "Lateral Esq.",
  costas: "Costas",
};

export default function CheckIn() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { studentId, anamnesis } = useStudentData();

  const [data, setData] = useState<Record<string, unknown>>({});
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [fotoFiles, setFotoFiles] = useState<Record<string, File | null>>({
    frente: null, lateral_dir: null, lateral_esq: null, costas: null,
  });
  const [fotoPreviews, setFotoPreviews] = useState<Record<string, string | null>>({
    frente: null, lateral_dir: null, lateral_esq: null, costas: null,
  });

  const baseline = anamnesis?.baseline_metrics ?? {};

  useEffect(() => {
    if (Object.keys(metrics).length === 0 && baseline) {
      const init: Record<string, string> = {};
      CHECKIN_METRICS.forEach((m) => {
        if (baseline[m.key] != null) init[`ini_${m.key}`] = String(baseline[m.key]);
      });
      setMetrics(init);
    }
  }, [baseline, metrics]);

  const progress = useMemo(() => {
    const all = CHECKIN_SECTIONS.flatMap((s) => s.fields);
    const filled = all.filter((f) => {
      const v = data[f.key];
      return v !== undefined && v !== null && v !== "";
    }).length;
    return Math.round((filled / all.length) * 100);
  }, [data]);

  function delta(key: string) {
    const ini = parseFloat(metrics[`ini_${key}`] ?? "");
    const cur = parseFloat(metrics[`cur_${key}`] ?? "");
    if (isNaN(ini) || isNaN(cur)) return null;
    return cur - ini;
  }

  function handleFotoFile(key: string, file: File) {
    setFotoFiles((p) => ({ ...p, [key]: file }));
    const url = URL.createObjectURL(file);
    setFotoPreviews((p) => ({ ...p, [key]: url }));
  }

  function handleFotoRemove(key: string) {
    setFotoFiles((p) => ({ ...p, [key]: null }));
    setFotoPreviews((p) => ({ ...p, [key]: null }));
  }

  async function submit() {
    if (!studentId) { toast.error("Não autenticado"); return; }
    setSaving(true);
    try {
      const current_metrics: Record<string, number> = {};
      CHECKIN_METRICS.forEach((m) => {
        const v = parseFloat(metrics[`cur_${m.key}`] ?? "");
        if (!isNaN(v)) current_metrics[m.key] = v;
      });

      // Upload fotos (best-effort)
      const fotos: Record<string, string> = {};
      for (const key of FOTO_KEYS) {
        const file = fotoFiles[key];
        if (file) {
          try { fotos[key] = await uploadToCloudinary(file); } catch { fotos[key] = ""; }
        }
      }

      const { error } = await sb.from("check_ins").insert({
        student_id: studentId,
        current_metrics,
        payload: { ...data, metrics_raw: metrics, fotos },
      });
      if (error) throw error;

      try {
        const { data: link } = await sb
          .from("coach_students")
          .select("coach_id")
          .eq("student_id", studentId)
          .eq("status", "active")
          .maybeSingle();
        if (link?.coach_id) {
          const { data: coachProfile } = await sb
            .from("profiles")
            .select("notification_email, email, full_name")
            .eq("user_id", link.coach_id)
            .maybeSingle();
          const coachEmail = coachProfile?.notification_email || coachProfile?.email;
          const anaPayload = (anamnesis?.payload as Record<string, unknown>) || {};
          const studentName = String(anaPayload.nome ?? "Aluno");
          const studentEmail = String(anaPayload.email ?? "");
          if (coachEmail) {
            void notifyCoach({
              coachEmail,
              studentName,
              studentEmail,
              kind: "checkin",
              summary: "Aluno enviou um novo check-in quinzenal.",
              data: { ...data, ...current_metrics, fotos },
            });
          }
        }
      } catch (notifyErr) {
        console.warn("notifyCoach falhou (check-in)", notifyErr);
      }

      toast.success("Check-in enviado ao seu coach.");
      qc.invalidateQueries({ queryKey: ["check-ins", studentId] });
      setTimeout(() => navigate("/evolution"), 1000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground">Check-in</h1>
            <p className="text-[11px] text-muted-foreground">Atualize seus dados da quinzena</p>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-primary">{progress}%</div>
            <div className="w-20 h-1 bg-muted rounded-full overflow-hidden mt-0.5">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Métricas com delta */}
        <Card className="bg-card/60 border-border p-5">
          <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">
            Medidas atuais
          </h2>
          <div className="space-y-3">
            {CHECKIN_METRICS.map((m) => {
              const d = delta(m.key);
              const Icon = d == null ? Minus : Math.abs(d) < 0.05 ? Minus : d < 0 ? TrendingDown : TrendingUp;
              const color = d == null || Math.abs(d ?? 1) < 0.05
                ? "text-muted-foreground"
                : (d! < 0 ? "text-emerald-400" : "text-amber-400");
              return (
                <div key={m.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                  <Label className="text-xs text-muted-foreground">{m.label}</Label>
                  <Input
                    type="number" step="0.1" placeholder="ini"
                    value={metrics[`ini_${m.key}`] ?? ""}
                    onChange={(e) => setMetrics((p) => ({ ...p, [`ini_${m.key}`]: e.target.value }))}
                    className="w-20 h-9 bg-card border-border text-center text-xs"
                  />
                  <Input
                    type="number" step="0.1" placeholder="atual"
                    value={metrics[`cur_${m.key}`] ?? ""}
                    onChange={(e) => setMetrics((p) => ({ ...p, [`cur_${m.key}`]: e.target.value }))}
                    className="w-20 h-9 bg-card border-border text-center text-xs"
                  />
                  <div className={cn("flex items-center gap-1 text-xs font-semibold w-16 justify-end", color)}>
                    <Icon className="w-3 h-3" />
                    {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)} ${m.unit}`}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {CHECKIN_SECTIONS.map((sec) => (
          <Card key={sec.id} className="bg-card/60 border-border p-5">
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">
              {sec.title}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {sec.fields.map((f) => (
                <div key={f.key} className={f.half ? "col-span-1" : "col-span-2"}>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    {f.label}
                  </Label>
                  <FormField
                    field={f}
                    value={data[f.key]}
                    onChange={(v) => setData((p) => ({ ...p, [f.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}

        {/* Fotos de progresso */}
        <Card className="bg-card/60 border-border p-5">
          <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">
            Fotos de Progresso
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {FOTO_KEYS.map((key) => (
              <FotoSlot
                key={key}
                label={FOTO_LABELS[key]}
                preview={fotoPreviews[key]}
                onFile={(f) => handleFotoFile(key, f)}
                onRemove={() => handleFotoRemove(key)}
              />
            ))}
          </div>
        </Card>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
          <Button className="flex-1" onClick={submit} disabled={saving || progress < 40}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Enviar check-in
          </Button>
        </div>
      </footer>
    </div>
  );
}
