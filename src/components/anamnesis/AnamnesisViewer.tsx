/**
 * AnamnesisViewer.tsx — Visualizador de anamnese para o Coach.
 * Blindado contra Arrays e Objetos (JSONB).
 * Inclui Modo de Edição Inline e Upload de Fotos.
 */

import { useEffect, useState } from "react";
import { sb } from "@/integrations/supabase/untyped";
import { ANAMNESIS_SECTIONS, BASELINE_KEYS, NEURO_SLIDERS, type AnamnesisField } from "@/lib/anamnesisSchema";
import { uploadStudentPhoto } from "@/lib/studentMedia";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/student/FormField";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProgressChart } from "@/components/student/ProgressChart";
import { toast } from "sonner";
import { FileDown, Loader2, ImageIcon, Pencil, Save, X, UploadCloud } from "lucide-react";
import MeasurementsEditor from "@/components/coach/MeasurementsEditor";
import CheckinFullEditor from "@/components/coach/CheckinFullEditor";
import PrescriptionProfileSection from "@/components/coach/PrescriptionProfileSection";
import { exportAnamnesisPDF } from "@/lib/coachPdfExport";
import { Private, PrivateImg, usePrivacyMode } from "@/components/coach/PrivacyMode";
import { formatDatePtBR } from "@/lib/formatDate";

interface Props {
  studentId: string;
  studentName?: string;
}

// Campos que identificam o aluno — respeitam o Modo Privacidade do coach.
const PERSONAL_FIELD_KEYS = new Set(["nome", "data_nasc", "whatsapp", "email", "cidade"]);

const PHOTO_KEYS: Array<{ key: string; label: string }> = [
  { key: "frente", label: "Frente" },
  { key: "costas", label: "Costas" },
  { key: "lateral_dir", label: "Lateral Direita" },
  { key: "lateral_esq", label: "Lateral Esquerda" },
];

const NEURO_KEYS = new Set(NEURO_SLIDERS.map(s => s.key));
const BASELINE_SET = new Set(BASELINE_KEYS as readonly string[]);
const DATE_KEYS = new Set(["data_nasc"]);
const TIME_KEYS = new Set(["horario_dormir", "horario_acordar"]);
const NUMBER_KEYS = new Set<string>(["meta_peso", "meta_prazo", "dias_treino", "anos_treino"]);

/**
 * Deriva o `type` efetivo do campo para renderizar com o mesmo <FormField />
 * usado pelo Check-in. Campos que já declaram `type` no schema (ex.: choices)
 * são respeitados; o resto cai nas heurísticas históricas (data, hora, número).
 */
function effectiveField(f: AnamnesisField): AnamnesisField {
  if (f.type) return f;
  if (DATE_KEYS.has(f.key)) return { ...f, type: "date" };
  if (TIME_KEYS.has(f.key)) return { ...f, type: "time" };
  if (BASELINE_SET.has(f.key) || NEURO_KEYS.has(f.key) || NUMBER_KEYS.has(f.key)) {
    return { ...f, type: "number", step: (f.step as string | number | undefined) ?? "0.1" };
  }
  return { ...f, type: "textarea" };
}

// FORMATADOR BLINDADO: Impede Crash caso o valor seja Array ou Objeto JSON
function fmt(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function AnamnesisViewer({ studentId, studentName }: Props) {
  const { privacy } = usePrivacyMode();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiFlags, setAiFlags] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; label: string } | null>(null);
  const [showPhotoCompare, setShowPhotoCompare] = useState(false);
  const [lastCheckin, setLastCheckin] = useState<{ submitted_at: string; fotos: Record<string, string> } | null>(null);
  const [loadingCheckin, setLoadingCheckin] = useState(false);
  const [editTarget, setEditTarget] = useState<"checkin" | null>(null);
  const [editCheckinFull, setEditCheckinFull] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Estados do Modo de Edição
  const [isEditing, setIsEditing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editPayload, setEditPayload] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: row, error } = await sb
        .from("anamnesis")
        .select("*")
        .eq("student_id", studentId)
        .maybeSingle();
      if (error) toast.error("Erro ao carregar anamnese");
      if (row) {
        setData((row.payload as Record<string, unknown>) || {});
        setUpdatedAt(row.updated_at as string);
        setAiSummary((row.ai_summary as string) || null);
        setAiFlags((row.ai_flags as Record<string, unknown>) || null);
      }
      setLoading(false);
    })();
  }, [studentId, reloadTick]);

  async function openPhotoCompare() {
    setShowPhotoCompare(true);
    setLoadingCheckin(true);
    const { data: row } = await sb
      .from("check_ins")
      .select("submitted_at, payload")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      const fotos = ((row.payload as Record<string, unknown>)?.fotos as Record<string, string>) || {};
      setLastCheckin({ submitted_at: row.submitted_at as string, fotos });
    } else {
      setLastCheckin(null);
    }
    setLoadingCheckin(false);
  }

  async function exportPDF() {
    if (!data) return;
    const name = (data.nome as string) || studentName || "Aluno";
    const { data: row } = await sb
      .from("anamnesis")
      .select("submitted_at, baseline_metrics")
      .eq("student_id", studentId)
      .maybeSingle();
    exportAnamnesisPDF({
      studentName: name,
      submittedAt: (row?.submitted_at as string) || updatedAt,
      baselineMetrics: (row?.baseline_metrics as Record<string, unknown>) || null,
      payload: data,
      sections: ANAMNESIS_SECTIONS.map((s) => ({
        title: s.title,
        fields: (s.fields || []).map((f) => ({ key: f.key, label: f.label })),
      })),
    });
  }

  // --- LÓGICA DE EDIÇÃO E UPLOAD ---
  function toggleEdit() {
    if (isEditing) {
      setIsEditing(false);
      setEditPayload({});
    } else {
      setEditPayload(JSON.parse(JSON.stringify(data || {})));
      setIsEditing(true);
    }
  }

  async function handlePhotoUpload(key: string, file: File) {
    setUploadingPhoto(key);
    try {
      const url = await uploadStudentPhoto(studentId, file);
      setEditPayload(prev => ({
        ...prev,
        fotos: {
          ...(prev.fotos as Record<string, string> || {}),
          [key]: url
        }
      }));
      toast.success("Foto anexada com sucesso!");
    } catch(e) {
      toast.error("Erro ao processar a foto.");
      console.error(e);
    } finally {
      setUploadingPhoto(null);
    }
  }

  async function handleSaveChanges() {
    setSaving(true);
    try {
      // Recalcula o baseline_metrics numérico
      const baseline: Record<string, number> = {};
      ["altura", "peso", "pescoco", "cintura", "quadril",
       "braco_d_relaxado", "braco_e_relaxado", "braco_d_contraido", "braco_e_contraido",
       "coxa_d", "coxa_e", "pant_d", "pant_e"].forEach(k => {
        const n = parseFloat(String(editPayload[k] ?? ""));
        if (!isNaN(n)) baseline[k] = n;
      });

      const { error } = await sb
        .from("anamnesis")
        .update({
          payload: editPayload,
          baseline_metrics: baseline,
          updated_at: new Date().toISOString()
        })
        .eq("student_id", studentId);

      if (error) throw error;

      toast.success("Avaliação e fotos atualizadas!");
      setData(editPayload);
      setIsEditing(false);
      setReloadTick(t => t + 1);
    } catch (e: any) {
      toast.error("Erro ao salvar as alterações");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Este aluno ainda não preencheu a anamnese.
        </CardContent>
      </Card>
    );
  }

  const fotos = (data.fotos as Record<string, string>) || {};
  const fotosWithUrl = PHOTO_KEYS.filter(p => fotos[p.key]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Private as="p" className="text-xl font-bold">{(data.nome as string) || studentName || "Aluno"}</Private>
          {updatedAt && (
            <p className="text-sm text-muted-foreground">
              Atualizado em {formatDatePtBR(updatedAt)}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap md:justify-end">
          {isEditing ? (
            <>
              <Button onClick={toggleEdit} variant="outline" size="sm" disabled={saving}>
                <X className="w-4 h-4 mr-1.5" /> Cancelar
              </Button>
              <Button onClick={handleSaveChanges} size="sm" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} 
                Salvar Alterações
              </Button>
            </>
          ) : (
            <>
              <Button onClick={toggleEdit} variant="outline" size="sm">
                <Pencil className="w-4 h-4 mr-1.5" /> Editar Avaliação / Fotos
              </Button>
              <Button onClick={() => setEditCheckinFull(true)} variant="outline" size="sm">
                <Pencil className="w-4 h-4 mr-1.5" /> Editar check-in
              </Button>
              {fotosWithUrl.length > 0 && (
                <Button onClick={openPhotoCompare} variant="outline" size="sm">
                  <ImageIcon className="w-4 h-4 mr-1.5" /> Ver fotos
                </Button>
              )}
              <Button onClick={exportPDF} variant="outline" size="sm">
                <FileDown className="w-4 h-4 mr-1.5" /> Exportar PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {aiSummary && !isEditing && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                Resumo da anamnese (IA)
              </p>
              {aiFlags && (aiFlags.lesoes || aiFlags.doencas || aiFlags.substancias) && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30">
                  Revisar com atenção
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
            {aiFlags?.detalhes ? (
              <p className="text-xs text-amber-700 border-t border-amber-500/20 pt-2">{String(aiFlags.detalhes)}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Gráfico de evolução oculto durante a edição para focar no formulário */}
      {!isEditing && <ProgressChart studentId={studentId} />}

      {/* BLOCO DE UPLOAD DE FOTOS (Visível apenas na edição) */}
      {isEditing && (
        <Card className="border-primary/50 bg-primary/5 shadow-sm">
          <div className="p-4 border-b border-primary/20 font-semibold text-primary flex items-center gap-2">
            <UploadCloud className="w-5 h-5" /> Adicionar / Substituir Fotos
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {PHOTO_KEYS.map(p => {
              const currentUrl = (editPayload.fotos as Record<string,string>)?.[p.key];
              return (
                <div key={p.key} className="space-y-2">
                  <p className="text-xs font-medium text-center text-muted-foreground">{p.label}</p>
                  <label className="relative flex flex-col items-center justify-center w-full aspect-[3/4] border-2 border-dashed border-primary/40 bg-background rounded-xl cursor-pointer hover:border-primary transition-colors overflow-hidden group">
                    {uploadingPhoto === p.key ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-[10px] font-bold text-primary">Enviando...</span>
                      </div>
                    ) : currentUrl ? (
                      <>
                        <PrivateImg src={currentUrl} alt={p.label} className="absolute inset-0 w-full h-full object-cover group-hover:opacity-40 transition-opacity" />
                        <div className="z-10 bg-background/90 p-2 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity">
                          <Pencil className="w-5 h-5 text-primary" />
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-2">
                        <UploadCloud className="w-8 h-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Upload</span>
                      </div>
                    )}
                    <input type="file" className="hidden" accept="image/*" disabled={uploadingPhoto === p.key} onChange={e => {
                      if (e.target.files?.[0]) handlePhotoUpload(p.key, e.target.files[0]);
                    }} />
                  </label>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <PrescriptionProfileSection studentId={studentId} />

      <Accordion type="multiple" defaultValue={["identificacao", "composicao", "substancias", "clinico"]} className="space-y-2">
        {ANAMNESIS_SECTIONS.map((s) => (
          <AccordionItem key={s.id} value={s.id} className="border rounded-lg px-4">
            <AccordionTrigger className="py-3">
              <span className="text-sm font-semibold text-primary">{s.title}</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2 py-2">
                {(s.fields || []).map((f) => (
                  <div key={f.key} className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-1.5 text-sm border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground font-medium">{f.label}</span>
                    {isEditing && privacy && PERSONAL_FIELD_KEYS.has(f.key) ? (
                      <span className="text-xs text-muted-foreground italic text-right max-w-[55%]">
                        Desative o Modo Privacidade para editar
                      </span>
                    ) : isEditing ? (
                      <div className="w-full md:max-w-[55%]">
                        <FormField
                          field={effectiveField(f)}
                          value={editPayload[f.key]}
                          onChange={(v) => setEditPayload({ ...editPayload, [f.key]: v })}
                        />
                      </div>
                    ) : (
                      PERSONAL_FIELD_KEYS.has(f.key) ? (
                        <Private className="font-medium text-right max-w-[55%] text-foreground">{fmt(data[f.key])}</Private>
                      ) : (
                        <span className="font-medium text-right max-w-[55%] text-foreground">{fmt(data[f.key])}</span>
                      )
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Modal de zoom de foto */}
      <Dialog open={!!zoomPhoto} onOpenChange={(o) => !o && setZoomPhoto(null)}>
        <DialogContent className="max-w-3xl bg-card p-2">
          <DialogTitle className="sr-only">{zoomPhoto?.label ?? "Foto do aluno"}</DialogTitle>
          {zoomPhoto && (
            <div className="flex flex-col items-center">
              <PrivateImg
                src={zoomPhoto.url}
                alt={zoomPhoto.label}
                className="max-h-[80vh] w-auto rounded-md object-contain"
              />
              <p className="text-sm font-semibold text-foreground mt-2 mb-1">{zoomPhoto.label}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de comparação de fotos */}
      <Dialog open={showPhotoCompare} onOpenChange={setShowPhotoCompare}>
        <DialogContent className="max-w-4xl bg-card max-h-[90vh] overflow-y-auto">
          <DialogTitle>
            Comparação de Fotos — <Private>{(data.nome as string) || studentName || "Aluno"}</Private>
          </DialogTitle>

          <div className="space-y-6 mt-2">
            {/* Fileira superior: Anamnese */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                📸 Fotos Iniciais (Anamnese)
                {updatedAt && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    · {formatDatePtBR(updatedAt)}
                  </span>
                )}
              </h4>
              <div className="grid grid-cols-4 gap-3">
                {PHOTO_KEYS.map((p) => (
                  <div key={p.key} className="space-y-1">
                    {fotos[p.key] ? (
                      <button
                        type="button"
                        onClick={() => setZoomPhoto({ url: fotos[p.key], label: `Anamnese — ${p.label}` })}
                        className="block w-full overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
                      >
                        <PrivateImg src={fotos[p.key]} alt={p.label} loading="lazy" className="w-full aspect-[3/4] object-cover" />
                      </button>
                    ) : (
                      <div className="w-full aspect-[3/4] rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground">
                        Sem foto
                      </div>
                    )}
                    <p className="text-xs text-center text-muted-foreground">{p.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Fileira inferior: Check-in recente */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                📸 Check-in mais recente
                {lastCheckin?.submitted_at && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    · {formatDatePtBR(lastCheckin.submitted_at)}
                  </span>
                )}
              </h4>
              {loadingCheckin ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : !lastCheckin || !PHOTO_KEYS.some(p => lastCheckin.fotos[p.key]) ? (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Nenhum check-in com fotos ainda.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {PHOTO_KEYS.map((p) => (
                    <div key={p.key} className="space-y-1">
                      {lastCheckin.fotos[p.key] ? (
                        <button
                          type="button"
                          onClick={() => setZoomPhoto({ url: lastCheckin.fotos[p.key], label: `Check-in — ${p.label}` })}
                          className="block w-full overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
                        >
                          <PrivateImg src={lastCheckin.fotos[p.key]} alt={p.label} loading="lazy" className="w-full aspect-[3/4] object-cover" />
                        </button>
                      ) : (
                        <div className="w-full aspect-[3/4] rounded-lg border border-dashed border-border bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground">
                          Sem foto
                        </div>
                      )}
                      <p className="text-xs text-center text-muted-foreground">{p.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editTarget && (
        <MeasurementsEditor
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          studentId={studentId}
          target={editTarget}
          onSaved={() => setReloadTick((t) => t + 1)}
        />
      )}

      <CheckinFullEditor
        open={editCheckinFull}
        onOpenChange={setEditCheckinFull}
        studentId={studentId}
        onSaved={() => setReloadTick((t) => t + 1)}
      />
    </div>
  );
}
