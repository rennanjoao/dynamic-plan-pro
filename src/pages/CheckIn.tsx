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
import { isFieldVisible } from "@/lib/anamnesisSchema";
import { uploadStudentPhoto, uploadStudentExam, openMedia } from "@/lib/studentMedia";
import type { FieldRenderContext, SectionDef } from "@/lib/anamnesisSchema";
import { FormField } from "@/components/student/FormField";
import { FotoSlot } from "@/components/shared/FotoSlot";
import { useStudentData } from "@/hooks/useStudentData";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, TrendingDown, TrendingUp, Minus, FilePlus2, FileEdit, X, FileText, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDatePtBR } from "@/lib/formatDate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const FOTO_KEYS = ["frente", "lateral_dir", "lateral_esq", "costas"] as const;
const FOTO_LABELS: Record<string, string> = {
  frente: "Frente",
  lateral_dir: "Lateral Dir.",
  lateral_esq: "Lateral Esq.",
  costas: "Costas",
};

/**
 * Card de uma seção do Check-in. Extraído para uso único em `step === 1` e
 * `step === 2` (antes era JSX duplicado nos dois lugares), e para aplicar a
 * filtragem condicional de campos num só ponto. Some sozinho (retorna null)
 * quando, após a filtragem, a seção não tem nenhum campo visível — é assim
 * que "Protocolo & Saúde" desaparece por completo para quem não tem
 * protocolo ativo e não é mulher, em vez de aparecer como um card vazio.
 */
function CheckinSectionCard({
  section,
  ctx,
  data,
  onFieldChange,
}: {
  section: SectionDef;
  ctx: FieldRenderContext;
  data: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
}) {
  const visibleFields = section.fields.filter((f) => isFieldVisible(f, ctx));
  if (visibleFields.length === 0) return null;
  return (
    <Card className="bg-card/60 border-border p-5">
      <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">
        {section.title}
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {visibleFields.map((f) => (
          <div key={f.key} className={f.half ? "col-span-1" : "col-span-2"}>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              {f.label}
            </Label>
            <FormField
              field={f}
              value={data[f.key]}
              onChange={(v) => onFieldChange(f.key, v)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

const STEP1_SECTION_IDS = ["identificacao", "dieta", "protocolo", "treino_sono"];

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

  // Exames PDF — arquivos novos ainda não enviados + já existentes (em modo update)
  type ExameItem = { url: string; nome: string; tamanho_kb: number; enviado_em: string };
  const [exameFiles, setExameFiles] = useState<File[]>([]);
  const [existingExames, setExistingExames] = useState<ExameItem[]>([]);

  // Modo: choose | new | update (atualiza último check-in)
  const [mode, setMode] = useState<"choose" | "new" | "update">("choose");
  const [lastCheckin, setLastCheckin] = useState<{
    id: string; submitted_at: string; edit_count: number;
    payload: Record<string, unknown>; current_metrics: Record<string, number>;
  } | null>(null);
  const [loadingLast, setLoadingLast] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (mode !== "choose") setStep(1);
  }, [mode]);

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
    setExameFiles([]);
    setExistingExames([]);
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
    const prevExames = (p.exames as ExameItem[]) ?? [];
    setExistingExames(Array.isArray(prevExames) ? prevExames : []);
    setExameFiles([]);
    setMode("update");
  }

  // [FIX MÉDIO] baseline movido para dentro do useEffect para evitar dependência
  // instável no array de deps (objeto recriado a cada render causava loop).
  useEffect(() => {
    const baseline = anamnesis?.baseline_metrics ?? {};
    if (mode === "new" && Object.keys(metrics).length === 0 && baseline) {
      const init: Record<string, string> = {};
      CHECKIN_METRICS.forEach((m) => {
        if (baseline[m.key] != null) init[`ini_${m.key}`] = String(baseline[m.key]);
      });
      setMetrics(init);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anamnesis, mode]);

  // Contexto usado para decidir quais campos condicionais aparecem: a
  // Anamnese como referência estática (protocolo, gênero) + as respostas já
  // dadas neste próprio check-in (ex.: "descreva o colateral" só depois de
  // responder que houve colateral).
  const fieldCtx: FieldRenderContext = useMemo(
    () => ({
      reference: (anamnesis?.payload as Record<string, unknown>) ?? {},
      answers: data,
    }),
    [anamnesis, data]
  );

  const progress = useMemo(() => {
    // Conta só os campos visíveis para este aluno — um campo condicional
    // escondido (ex.: colaterais de hormônio para quem não tem protocolo)
    // não deve contar contra o % de preenchimento de ninguém.
    const all = CHECKIN_SECTIONS.flatMap((s) => s.fields).filter((f) => isFieldVisible(f, fieldCtx));
    const filled = all.filter((f) => {
      const v = data[f.key];
      return v !== undefined && v !== null && v !== "";
    }).length;
    return all.length === 0 ? 100 : Math.round((filled / all.length) * 100);
  }, [data, fieldCtx]);

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

  function handleExameAdd(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const valid: File[] = [];
    for (const f of arr) {
      if (f.type !== "application/pdf") {
        toast.error(`"${f.name}" não é um PDF.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" excede 10MB.`);
        continue;
      }
      valid.push(f);
    }
    setExameFiles((prev) => {
      const remainingSlots = 3 - existingExames.length - prev.length;
      if (remainingSlots <= 0) {
        toast.error("Máximo de 3 exames por check-in.");
        return prev;
      }
      return [...prev, ...valid.slice(0, remainingSlots)];
    });
  }

  function removeExistingExame(idx: number) {
    setExistingExames((prev) => prev.filter((_, i) => i !== idx));
  }

  function removePendingExame(idx: number) {
    setExameFiles((prev) => prev.filter((_, i) => i !== idx));
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
        if (!file) continue;
        const toastId = `upload-${key}`;
        try {
          toast.loading(`Enviando foto (${FOTO_LABELS[key] ?? key})...`, { id: toastId });
          const result = await Promise.race([
            uploadStudentPhoto(studentId, file),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 30_000)
            ),
          ]);
          fotos[key] = result as string;
          toast.dismiss(toastId);
        } catch (err) {
          toast.dismiss(toastId);
          const isTimeout = err instanceof Error && err.message === "timeout";
          if (isTimeout) {
            toast.warning(`Foto ${FOTO_LABELS[key] ?? key} não enviada (conexão lenta) — check-in salvo sem ela.`);
          }
          // Preserva foto anterior se existir; caso contrário deixa vazio
          fotos[key] = existingFotos[key] ?? "";
        }
      }

      // Upload de exames PDF (best-effort). Mantém os já existentes (que o
      // aluno não removeu) e concatena os novos.
      const exames: ExameItem[] = [...existingExames];
      for (const file of exameFiles) {
        const toastId = `upload-exame-${file.name}`;
        try {
          toast.loading(`Enviando exame (${file.name})...`, { id: toastId });
          const url = await Promise.race([
            uploadStudentExam(studentId, file),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 60_000)),
          ]);
          exames.push({
            url: url as string,
            nome: file.name,
            tamanho_kb: Math.round(file.size / 1024),
            enviado_em: new Date().toISOString(),
          });
          toast.dismiss(toastId);
        } catch (err) {
          toast.dismiss(toastId);
          toast.warning(`Exame "${file.name}" não enviado — check-in salvo sem ele.`);
        }
      }

      let newCheckInId: string | null = null;
      if (mode === "update" && lastCheckin) {
        const { error } = await sb
          .from("check_ins")
          .update({
            current_metrics,
            payload: { ...data, metrics_raw: metrics, fotos, exames },
            edit_count: (lastCheckin.edit_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lastCheckin.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await sb.from("check_ins").insert({
          student_id: studentId,
          current_metrics,
          payload: { ...data, metrics_raw: metrics, fotos, exames },
        }).select("id").single();
        if (error) throw error;
        newCheckInId = inserted?.id ?? null;
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
                (data.atencao_urgente === "Sim" ? "⚠️ Atenção prioritária solicitada pelo aluno. " : "") +
                (mode === "update"
                  ? "Aluno atualizou o último check-in."
                  : "Aluno enviou um novo check-in quinzenal."),
              data: { ...data, ...current_metrics, fotos, _updated: mode === "update" },
            });
          }
        }
      } catch (notifyErr) {
        console.warn("notifyCoach falhou (check-in)", notifyErr);
      }

      try {
        const checkInIdForInsight = mode === "update" && lastCheckin ? lastCheckin.id : newCheckInId;
        if (checkInIdForInsight) {
          let ok = false;
          for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
            try {
              const { error: insightErr } = await supabase.functions.invoke("checkin-insight", {
                body: { checkInId: checkInIdForInsight },
              });
              if (!insightErr) ok = true;
              else console.warn(`checkin-insight falhou (tentativa ${attempt}/2)`, insightErr);
            } catch (e) {
              console.warn(`checkin-insight exceção (tentativa ${attempt}/2)`, e);
            }
            if (!ok && attempt < 2) await new Promise((r) => setTimeout(r, 800));
          }
        }
      } catch (insightOuterErr) {
        console.warn("Disparo de checkin-insight falhou (não bloqueia o check-in)", insightOuterErr);
      }

      try {
        const checkInIdForInsight = mode === "update" && lastCheckin ? lastCheckin.id : newCheckInId;
        const hasAllFotos =
          !!fotos.frente && !!fotos.lateral_dir && !!fotos.lateral_esq && !!fotos.costas;
        if (checkInIdForInsight && hasAllFotos) {
          void supabase.functions
            .invoke("photo-analysis", { body: { checkInId: checkInIdForInsight } })
            .then(({ error }) => {
              if (error) console.warn("photo-analysis falhou", error);
            })
            .catch((e) => console.warn("photo-analysis exceção", e));
        }
      } catch (photoOuterErr) {
        console.warn("Disparo de photo-analysis falhou (não bloqueia o check-in)", photoOuterErr);
      }

      // Triagem/rascunho de ajuste de protocolo (fire-and-forget, nunca bloqueia).
      try {
        const checkInIdForAdjust = mode === "update" && lastCheckin ? lastCheckin.id : newCheckInId;
        if (checkInIdForAdjust) {
          void supabase.functions
            .invoke("protocol-renewal-draft", { body: { checkInId: checkInIdForAdjust } })
            .then(({ error }) => {
              if (error) console.warn("protocol-renewal-draft falhou", error);
            })
            .catch((e) => console.warn("protocol-renewal-draft exceção", e));
        }
      } catch (adjustOuterErr) {
        console.warn("Disparo de protocol-renewal-draft falhou (não bloqueia o check-in)", adjustOuterErr);
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
                      {formatDatePtBR(lastCheckin.submitted_at)}.{" "}
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
          <Button variant="ghost" size="icon" onClick={() => setMode("choose")} aria-label="Voltar para escolha">
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
          {/*
            Antes, a única flecha do header voltava pra tela "O que deseja fazer?"
            (setMode("choose")) — sair de fato exigia 2 toques (voltar à escolha,
            depois sair dali). Este X sai direto pro student-area em 1 toque.
          */}
          <Button variant="ghost" size="icon" onClick={() => navigate("/student-area")} aria-label="Sair do check-in">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Stepper */}
        <div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  step >= s ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">Etapa {step} de 3</p>
        </div>

        {step === 1 && (
          <>
            {CHECKIN_SECTIONS.filter((s) => STEP1_SECTION_IDS.includes(s.id)).map((sec) => (
              <CheckinSectionCard
                key={sec.id}
                section={sec}
                ctx={fieldCtx}
                data={data}
                onFieldChange={(key, v) => setData((p) => ({ ...p, [key]: v }))}
              />
            ))}
          </>
        )}

        {step === 2 && (
          <>
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

        {CHECKIN_SECTIONS.filter((s) => !STEP1_SECTION_IDS.includes(s.id)).map((sec) => (
          <CheckinSectionCard
            key={sec.id}
            section={sec}
            ctx={fieldCtx}
            data={data}
            onFieldChange={(key, v) => setData((p) => ({ ...p, [key]: v }))}
          />
        ))}

        {/* Fotos de progresso */}
        <Card className="bg-card/60 border-border p-5">
          <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">
            Fotos de Progresso
          </h2>
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 space-y-1 text-[11px] text-muted-foreground">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">📸 Como tirar a foto correta</p>
            {[
              "Mesmo ambiente e fundo de sempre",
              "Mesma iluminação (evite sombras e contraluz)",
              "Mesma roupa — sunga, bermuda ou top",
              "Mesmo horário (preferencialmente em jejum)",
              "Câmera na altura da cintura, distância de 1,5m",
            ].map((tip) => (
              <p key={tip}>· <span className="text-foreground font-medium">{tip}</span></p>
            ))}
          </div>
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

        {/* Exames (PDF) — opcional, até 3 arquivos de 10MB */}
        <Card className="bg-card/60 border-border p-5">
          <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-2">
            Exames (PDF) <span className="text-[10px] font-normal text-muted-foreground normal-case">— opcional</span>
          </h2>
          <p className="text-[11px] text-muted-foreground mb-3">
            Anexe até 3 arquivos PDF (10MB cada) para seu coach revisar junto com o check-in.
          </p>
          <div className="space-y-2">
            {existingExames.map((ex, i) => (
              <div key={`ex-${i}`} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <button type="button" onClick={() => openMedia(ex.url)} className="flex-1 truncate text-left hover:underline">
                  {ex.nome}
                </button>
                <span className="text-muted-foreground text-[10px]">{ex.tamanho_kb}KB</span>
                <button type="button" onClick={() => removeExistingExame(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {exameFiles.map((f, i) => (
              <div key={`new-${i}`} className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/30 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-muted-foreground text-[10px]">{Math.round(f.size / 1024)}KB</span>
                <button type="button" onClick={() => removePendingExame(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {existingExames.length + exameFiles.length < 3 && (
              <label className="flex items-center justify-center gap-2 text-xs border-2 border-dashed border-border rounded-lg py-4 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Anexar PDF ({3 - existingExames.length - exameFiles.length} restante{3 - existingExames.length - exameFiles.length === 1 ? "" : "s"})</span>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleExameAdd(e.target.files); e.target.value = ""; }}
                />
              </label>
            )}
          </div>
        </Card>
          </>
        )}

        {step === 3 && (
          <Card className="bg-card/60 border-border p-5">
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider mb-4">
              Revisar & Enviar
            </h2>
            <ul className="space-y-2 text-sm text-foreground">
              <li>
                <span className="text-muted-foreground">Fotos anexadas:</span>{" "}
                <span className="font-semibold">
                  {FOTO_KEYS.filter((k) => fotoPreviews[k]).length} de {FOTO_KEYS.length}
                </span>
              </li>
              <li>
                <span className="text-muted-foreground">Peso atual:</span>{" "}
                <span className="font-semibold">
                  {metrics["cur_peso"] ? `${metrics["cur_peso"]} kg` : "—"}
                </span>
              </li>
              <li>
                <span className="text-muted-foreground">Progresso do formulário:</span>{" "}
                <span className="font-semibold">{progress}%</span>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground mt-4">
              Revise os dados acima. Ao enviar, seu coach será notificado automaticamente.
            </p>
          </Card>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          )}
          {step < 3 ? (
            <Button className="flex-1" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
              Continuar
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={submit}
              disabled={saving || (progress < 25 && data.atencao_urgente !== "Sim")}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Enviar check-in
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
