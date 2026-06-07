/**
 * AnamnesisViewer.tsx — Visualizador de anamnese para o Coach.
 * Blindado contra Arrays e Objetos (JSONB).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ANAMNESIS_SECTIONS } from "@/lib/anamnesisSchema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProgressChart } from "@/components/student/ProgressChart";
import { toast } from "sonner";
import { FileDown, Loader2, ImageIcon } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface Props {
  studentId: string;
  studentName?: string;
}

const PHOTO_KEYS: Array<{ key: string; label: string }> = [
  { key: "frente", label: "Frente" },
  { key: "costas", label: "Costas" },
  { key: "lateral_dir", label: "Lateral Direita" },
  { key: "lateral_esq", label: "Lateral Esquerda" },
];

// FORMATADOR BLINDADO: Impede Crash caso o valor seja Array ou Objeto JSON
function fmt(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function AnamnesisViewer({ studentId, studentName }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; label: string } | null>(null);
  const [showPhotoCompare, setShowPhotoCompare] = useState(false);
  const [lastCheckin, setLastCheckin] = useState<{ submitted_at: string; fotos: Record<string, string> } | null>(null);
  const [loadingCheckin, setLoadingCheckin] = useState(false);

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
      }
      setLoading(false);
    })();
  }, [studentId]);

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

  function exportPDF() {
    if (!data) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita popups para exportar"); return; }
    const name = (data.nome as string) || studentName || "Aluno";
    
    // Proteção na extração de campos
    const sections = ANAMNESIS_SECTIONS.map((s) => `
      <h2>${s.title}</h2>
      ${(s.fields || []).map((f) => `
        <div class="row"><span class="lbl">${f.label}</span><span class="val">${fmt(data[f.key])}</span></div>
      `).join("")}
    `).join("");
    
    w.document.write(`
      <!doctype html><html><head><meta charset="utf-8"><title>Anamnese — ${name}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;max-width:780px;margin:auto;color:#111}
        h1{font-size:20px;border-bottom:2px solid #B11226;padding-bottom:8px}
        h2{font-size:14px;color:#B11226;margin-top:22px;text-transform:uppercase;letter-spacing:.05em}
        .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}
        .lbl{color:#555;font-weight:600}
        .val{max-width:55%;text-align:right}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>Anamnese — ${name}</h1>
      <p style="color:#888;font-size:11px">Gerado em ${new Date().toLocaleDateString("pt-BR")}</p>
      ${sections}
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>
    `);
    w.document.close();
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{(data.nome as string) || studentName || "Aluno"}</h2>
          {updatedAt && (
            <p className="text-sm text-muted-foreground">
              Atualizado em {new Date(updatedAt).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {fotosWithUrl.length > 0 && (
            <Button onClick={openPhotoCompare} variant="outline" size="sm">
              <ImageIcon className="w-4 h-4 mr-1.5" /> Ver fotos
            </Button>
          )}
          <Button onClick={exportPDF} variant="outline" size="sm">
            <FileDown className="w-4 h-4 mr-1.5" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Gráfico de evolução (peso + % gordura estimada) */}
      <ProgressChart studentId={studentId} />

      <Accordion type="multiple" defaultValue={["identificacao", "composicao"]} className="space-y-2">
        {ANAMNESIS_SECTIONS.map((s) => (
          <AccordionItem key={s.id} value={s.id} className="border rounded-lg px-4">
            <AccordionTrigger className="py-3">
              <span className="text-sm font-semibold text-primary">{s.title}</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2 py-2">
                {(s.fields || []).map((f) => (
                  <div key={f.key} className="flex items-center justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium text-right max-w-[55%]">{fmt(data[f.key])}</span>
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
              <img
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
            Comparação de Fotos — {(data.nome as string) || studentName || "Aluno"}
          </DialogTitle>

          <div className="space-y-6 mt-2">
            {/* Fileira superior: Anamnese */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                📸 Fotos Iniciais (Anamnese)
                {updatedAt && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    · {new Date(updatedAt).toLocaleDateString("pt-BR")}
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
                        <img src={fotos[p.key]} alt={p.label} loading="lazy" className="w-full aspect-[3/4] object-cover" />
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
                    · {new Date(lastCheckin.submitted_at).toLocaleDateString("pt-BR")}
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
                          <img src={lastCheckin.fotos[p.key]} alt={p.label} loading="lazy" className="w-full aspect-[3/4] object-cover" />
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
    </div>
  );
}
