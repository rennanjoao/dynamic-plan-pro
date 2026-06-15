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
import { ArrowLeft, CheckCircle2, Loader2, TrendingDown, TrendingUp, Minus, FilePlus2, FileEdit } from "lucide-react";
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

  // Modo: choose | new | update (atualiza último check-in)
  const [mode, setMode] = useState<"choose" | "new" | "update">("choose");
  const [lastCheckin, setLastCheckin] = useState<{
    id: string; submitted_at: string; edit_count: number;
    payload: Record<string, unknown>; current_metrics: Record<string, number>;
  } | null>(null);
  const [loadingLast, setLoadingLast] = useState(true);

  // Carrega último check-in para decidir o que oferecer
  useEffect(() => {
    if (!studentId) return;
    (async () => {
      setLoadingLast(true);
      const { data: row } = await sb
        .from("check_ins")
        .select("id, submitted_at, edit_count, payload, current_metrics")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLastCheckin(row ?? null);
      // Se não existe nenhum, segue direto para novo
      if (!row) setMode("new");
      setLoadingLast(false);
    })();
  }, [studentId]);

  function startNew() {
    setData({});
    setMetrics({});
    setFotoFiles({ frente: null, lateral_dir: null, lateral_esq: null, costas: null });
    setFotoPreviews({ frente: null, lateral_dir: null, lateral_esq: null, costas: null });
    setMode("new");
  }

  function startUpdate() {
    if (!lastCheckin) return;
    const p = (lastCheckin.payload ?? {}) as Record<string, unknown>;
    const rawMetrics = (p.metrics_raw as Record<string, string>) ?? {};
    setData({ ...p });
    // Reidrata métricas atuais a partir de current_metrics e ini de metrics_raw
    const m: Record<string, string> = { ...rawMetrics };
    CHECKIN_METRICS.forEach((cm) => {
      const cur = lastCheckin.current_metrics?.[cm.key];
      if (typeof cur === "number") m[`cur_${cm.key}`] = String(cur);
    });
    setMetrics(m);
    // Fotos existentes vão como previews; só substituem se o aluno carregar arquivo novo
    const fotos = (p.fotos as Record<string, string>) ?? {};
    setFotoPreviews({
      frente: fotos.frente || null,
      lateral_dir: fotos.lateral_dir || null,
      lateral_esq: fotos.lateral_esq || null,
      costas: fotos.costas || null,
    });
    setMode("update");
  }

  const baseline = anamnesis?.baseline_metrics ?? {};

  useEffect(() => {
    if (mode === "new" && Object.keys(metrics).length === 0 && baseline) {
      const init: Record<string, string> = {};
      CHECKIN_METRICS.forEach((m) => {
        if (baseline[m.key] != null) init[`ini_${m.key}`] = String(baseline[m.key]);
      });
      setMetrics(init);
    }
  }, [baseline, metrics, mode]);

  const progress = useMemo(() => {
    const all = CHECKIN_SECTIONS.flatMap((s) => s.fields);
    const filled = all.filter((f) => {
      const v = data[f.key];
      return v !== undefined && v !== null && v !== "";
    }).length;
    return Math.round((filled / all.length) * 100);
  }, [data]);

  function delta(key: string) {
    const ini = parseFloat(String(metrics[`ini_${key}`] ?? "").replace(",", "."));
    const cur = parseFloat(String(metrics[`cur_${key}`] ?? "").replace(",", "."));
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
    if (mode === "update" && lastCheckin && lastCheckin.edit_count >= 3) {
      toast.error("Você já editou este check-in 3 vezes.");
      return;
    }
    setSaving(true);
    try {
      const current_metrics: Record<string, number> = {};
      CHECKIN_METRICS.forEach((m) => {
        const v = parseFloat(String(metrics[`cur_${m.key}`] ?? "").replace(",", "."));
        if (!isNaN(v)) current_metrics[m.key] = v;
      });

      // Upload fotos novas (best-effort). Preserva URLs existentes em modo update.
      const existingFotos =
        mode === "update" && lastCheckin
          ? ((lastCheckin.payload as Record<string, unknown>)?.fotos as Record<string, string>) || {}
          : {};
      const fotos: Record<string, string> = { ...existingFotos };
      for (const key of FOTO_KEYS) {
        const file = fotoFiles[key];
        if (file) {
          try { fotos[key] = await uploadToCloudinary(file); } catch { fotos[key] = ""; }
        }
      }

      if (mode === "update" && lastCheckin) {
        const { error } = await sb
          .from("check_ins")
          .update({
            current_metrics,
            payload: { ...data, metrics_raw: metrics, fotos },
            edit_count: (lastCheckin.edit_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lastCheckin.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("check_ins").insert({
          student_id: studentId,
          current_metrics,
          payload: { ...data, metrics_raw: metrics, fotos },
        });
        if (error) throw error;
      }

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
              summary:
                mode === "update"
                  ? "Aluno atualizou o último check-in."
                  : "Aluno enviou um novo check-in quinzenal.",
              data: { ...data, ...current_metrics, fotos, _updated: mode === "update" },
            });
          }
        }
      } catch (notifyErr) {
        console.warn("notifyCoach falhou (check-in)", notifyErr);
      }

      toast.success(
        mode === "update"
          ? "Check-in atualizado e enviado ao seu coach."
          : "Check-in enviado ao seu coach."
      );
      qc.invalidateQueries({ queryKey: ["check-ins", studentId] });
      setTimeout(() => navigate("/evolution"), 1000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // Tela de escolha entre novo check-in e atualizar o último
  if (mode === "choose") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-base font-bold text-foreground">Check-in</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-4">
          {loadingLast ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-foreground">O que deseja fazer?</h2>
              <p className="text-sm text-muted-foreground">
                Você pode iniciar um novo check-in ou ajustar o último que enviou.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={startNew}
                  className="text-left rounded-2xl border border-border bg-card/60 p-5 hover:border-primary/60 hover:bg-card transition-colors"
                >
                  <FilePlus2 className="w-6 h-6 text-primary mb-3" />
                  <h3 className="text-sm font-bold text-foreground mb-1">Fazer novo check-in</h3>
                  <p className="text-xs text-muted-foreground">
                    Envie a quinzena atual, com novas medidas e fotos.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={startUpdate}
                  disabled={!lastCheckin || (lastCheckin.edit_count ?? 0) >= 3}
                  className={cn(
                    "text-left rounded-2xl border p-5 transition-colors",
                    !lastCheckin || (lastCheckin.edit_count ?? 0) >= 3
                      ? "border-border/40 bg-card/30 opacity-60 cursor-not-allowed"
                      : "border-border bg-card/60 hover:border-primary/60 hover:bg-card"
                  )}
                >
                  <FileEdit className="w-6 h-6 text-primary mb-3" />
                  <h3 className="text-sm font-bold text-foreground mb-1">Atualizar último check-in</h3>
                  {lastCheckin ? (
                    <p className="text-xs text-muted-foreground">
                      Enviado em{" "}
                      {new Date(lastCheckin.submitted_at).toLocaleDateString("pt-BR")}.{" "}
                      <span className="font-semibold text-foreground">
                        Edições usadas: {lastCheckin.edit_count ?? 0}/3
                      </span>
                      {(lastCheckin.edit_count ?? 0) >= 3 &&
                        " — limite atingido, crie um novo."}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Você ainda não tem nenhum check-in registrado.
                    </p>
                  )}
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setMode("choose")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground">
              {mode === "update" ? "Atualizar check-in" : "Check-in"}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {mode === "update" && lastCheckin
                ? `Edição ${(lastCheckin.edit_count ?? 0) + 1} de 3`
                : "Atualize seus dados da quinzena"}
            </p>
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
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 space-y-1 text-[11px] text-muted-foreground">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">📏 Como medir</p>
            <p>• <span className="text-foreground font-medium">Pescoço:</span> logo abaixo do "gogó".</p>
            <p>• <span className="text-foreground font-medium">Cintura:</span> no umbigo (M) ou parte mais fina (F).</p>
            <p>• <span className="text-foreground font-medium">Quadril:</span> na maior protuberância dos glúteos.</p>
            <p>• Fita firme, <span className="text-foreground font-medium">sem afundar na pele</span>.</p>
          </div>
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
