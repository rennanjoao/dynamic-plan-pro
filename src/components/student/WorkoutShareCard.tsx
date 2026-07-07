// src/components/student/WorkoutShareCard.tsx
// Card de Compartilhamento — Elite Prime Hub
// Sprint 13 — Formatos adaptativos (Story 9:16 / Feed 4:5 / Quadrado 1:1)
// + mensagem motivacional dinâmica (src/lib/quotes.ts)

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Share2, X, Loader2, Eye, EyeOff, Smartphone, Image as ImageIcon, Square } from "lucide-react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getRandomWorkoutQuote } from "@/lib/quotes";

interface Props {
  studentName?: string;
  workoutName: string;
  durationSec: number;
  totalSets: number;
  completedExercises: number;
  totalExercises: number;
  coachName?: string;
  teamName?: string;
  streak?: number;
  coachId?: string;
  studentId?: string; // necessário para gerar/buscar o código de referral
  prs?: { exerciseName: string; weightKg: number; reps: number }[];
  totalVolumeKg?: number; // soma de kg x reps da sessão — métrica "orgulho" não tóxica
  onClose: () => void;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}min`;
  }
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

function fmtVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}

// Identidade Elite Prime Hub
const BG = "#080808";
const GOLD = "#C5A059";
const RED = "#B11226";
const BORDER = "#2A2A2A";

// ── DEMANDA 3: Formatos de exportação ──────────────────────────────
// Cada formato define a proporção do card (aspect-ratio) e o padding
// vertical/horizontal que funciona como "zona segura" — área livre de
// elementos críticos para não ser coberta pela UI do Instagram.
type ShareFormat = "story" | "feed" | "square";

interface FormatConfig {
  label: string;
  shortLabel: string;
  ratio: string; // valor CSS de aspect-ratio
  padding: string; // shorthand CSS padding (top right/left bottom)
  safeZoneHint: string;
  filenameSuffix: string;
  Icon: typeof Smartphone;
}

const FORMAT_CONFIG: Record<ShareFormat, FormatConfig> = {
  story: {
    label: "Instagram Story",
    shortLabel: "Story 9:16",
    ratio: "9 / 16",
    // Stories: ~14% no topo (nome/foto do usuário do IG) e ~18% embaixo
    // (barra de mensagem/reações) ficam livres de qualquer elemento crítico.
    padding: "14% 7% 18%",
    safeZoneHint: "Margens ajustadas para o nome do perfil (topo) e a barra de reações (rodapé) do Stories.",
    filenameSuffix: "story",
    Icon: Smartphone,
  },
  feed: {
    label: "Feed",
    shortLabel: "Feed 4:5",
    ratio: "4 / 5",
    // No Feed a UI do Instagram fica FORA da imagem (like/comentário abaixo,
    // usuário acima) — o padding aqui é só respiro estético, não zona segura.
    padding: "9% 8% 9%",
    safeZoneHint: "Formato vertical otimizado para ocupar o máximo de espaço no Feed.",
    filenameSuffix: "feed",
    Icon: ImageIcon,
  },
  square: {
    label: "Quadrado",
    shortLabel: "Quadrado 1:1",
    ratio: "1 / 1",
    padding: "8% 8% 8%",
    safeZoneHint: "Formato clássico 1:1 — compatível com Feed, WhatsApp e outras redes.",
    filenameSuffix: "quadrado",
    Icon: Square,
  },
};

const FORMAT_ORDER: ShareFormat[] = ["story", "feed", "square"];

export default function WorkoutShareCard({
  studentName = "Membro Elite Prime Hub",
  workoutName,
  durationSec,
  totalSets,
  completedExercises,
  totalExercises,
  coachName = "Rennan João",
  teamName,
  streak,
  coachId,
  studentId,
  prs,
  totalVolumeKg,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  // Dilema da Carga: opt-in explícito do aluno, off por padrão.
  const [showLoad, setShowLoad] = useState(false);
  // DEMANDA 3: formato de exportação selecionado pelo aluno.
  const [format, setFormat] = useState<ShareFormat>("story");
  const cfg = FORMAT_CONFIG[format];

  const hasPR = !!(prs && prs.length > 0);
  // DEMANDA 2: escolhida uma única vez por sessão de compartilhamento —
  // não deve trocar quando o aluno só troca o formato do card.
  const quote = useMemo(() => getRandomWorkoutQuote(hasPR), [hasPR]);

  useEffect(() => {
    if (!studentId) return;
    (supabase as any)
      .rpc("get_or_create_referral_code", { p_user_id: studentId })
      .then(({ data }: { data: string | null }) => { if (data) setReferralCode(data); })
      .catch(() => { /* fallback silencioso — QR usa URL sem ref abaixo */ });
  }, [studentId]);

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const generateBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: BG,
      scale: 3,
      useCORS: true,
      logging: false,
      allowTaint: true,
    });
    return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  };

  const qrTrackedUrl = referralCode
    ? `https://www.eliteprimehub.com.br?ref=${referralCode}&utm_source=workout_share&utm_medium=qrcode&utm_campaign=student_referral`
    : "https://www.eliteprimehub.com.br";

  const slug = (teamName || "elite-prime-hub")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "treino";

  const filename = `${slug}-treino-${cfg.filenameSuffix}.png`;

  const handleShare = async () => {
    try {
      setBusy(true);
      const blob = await generateBlob();
      if (!blob) throw new Error();
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as unknown as { canShare?: (d: object) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await (navigator as unknown as { share: (d: object) => Promise<void> }).share({
          files: [file],
          title: `Treino concluído — Elite Prime Hub`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.info("Imagem salva — abra no Instagram para compartilhar.");
      }
    } catch {
      toast.error("Não foi possível compartilhar.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    try {
      setBusy(true);
      const blob = await generateBlob();
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Imagem salva!");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}
    >
      <div className="w-full max-w-sm space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-black text-lg uppercase italic tracking-tighter">
            Compartilhar Resultado
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DEMANDA 3: Seletor de formato — troca aspect-ratio + safe zone do card ANTES da exportação */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5 bg-white/5 border border-white/10 rounded-2xl p-1.5">
            {FORMAT_ORDER.map((key) => {
              const opt = FORMAT_CONFIG[key];
              const active = format === key;
              const OptIcon = opt.Icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormat(key)}
                  aria-pressed={active}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition ${
                    active ? "bg-primary text-black shadow-lg shadow-primary/30" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  <OptIcon className="w-4 h-4" />
                  <span className="text-[9px] font-black uppercase tracking-wide leading-none">
                    {opt.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-white/35 text-center px-2 leading-snug">
            {cfg.safeZoneHint}
          </p>
        </div>

        {/* Toggle: Dilema da Carga — opt-in explícito, sempre off por padrão */}
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            {showLoad ? (
              <Eye className="w-4 h-4" style={{ color: GOLD }} />
            ) : (
              <EyeOff className="w-4 h-4 text-white/40" />
            )}
            <span className="text-xs font-bold text-white/70 uppercase tracking-wide">
              Exibir cargas (kg) na imagem
            </span>
          </div>
          <Switch checked={showLoad} onCheckedChange={setShowLoad} />
        </div>

        {/* Card — proporção e zona segura mudam conforme o formato selecionado acima */}
        <div
          ref={cardRef}
          style={{
            width: "100%",
            aspectRatio: cfg.ratio,
            background: BG,
            borderRadius: "20px",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            border: `1px solid ${BORDER}`,
          }}
        >
          {/* Gradiente radial no topo */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `radial-gradient(ellipse 80% 45% at 50% 0%, rgba(197,160,89,0.16) 0%, transparent 70%)`,
            }}
          />
          {/* Glow inferior em vermelho — assinatura de marca sutil */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `radial-gradient(ellipse 70% 35% at 50% 100%, rgba(177,18,38,0.14) 0%, transparent 70%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "10%",
              right: "10%",
              height: "1px",
              background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            }}
          />

          {/* Conteúdo — padding vertical definido por FORMAT_CONFIG[format].padding,
              que funciona como Safe Zone: no Story, libera espaço para a UI nativa
              do Instagram sobreposta à imagem; no Feed/Quadrado, essa UI fica fora
              da imagem, então o padding é só respiro estético. */}
          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: cfg.padding,
            }}
          >
            {/* Topo: marca + data */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <p style={{ color: GOLD, fontSize: "11px", letterSpacing: "0.22em", fontWeight: 700, textTransform: "uppercase", marginBottom: "2px" }}>
                  ELITE PRIME HUB
                </p>
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: 700 }}>
                  Performance
                </p>
              </div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", textAlign: "right" }}>
                {today}
              </p>
            </div>

            {/* Tag "Treino Concluído" — em Red, o selo de status */}
            <div style={{ marginTop: "18px" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  background: `${RED}22`,
                  border: `1px solid ${RED}88`,
                  color: "#FF5C6C",
                  fontSize: "10px",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                ✓ Treino Concluído
              </span>
            </div>

            {/* Centro: aluno + treino + troféu */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "18px",
                marginTop: "8px",
              }}
            >
              <div
                style={{
                  width: "84px",
                  height: "84px",
                  borderRadius: "50%",
                  border: `2px solid ${GOLD}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "40px",
                  boxShadow: `0 0 30px ${GOLD}33`,
                }}
              >
                🏆
              </div>

              <div>
                <p style={{ color: "#fff", fontSize: "20px", fontWeight: 800, lineHeight: 1.2, marginBottom: "6px" }}>
                  {studentName}
                </p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", letterSpacing: "0.15em", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>
                  Treino
                </p>
                <p style={{ color: "#fff", fontSize: "32px", fontWeight: 900, lineHeight: 1, letterSpacing: "-1px" }}>
                  {workoutName}
                </p>
              </div>

              {/* DEMANDA 2: frase motivacional dinâmica (src/lib/quotes.ts) —
                  sorteada uma vez por sessão de compartilhamento, focada em
                  consistência/adesão/disciplina (ou reforço de recorde). */}
              <p style={{ color: GOLD, fontSize: "14px", fontWeight: 800, fontStyle: "italic", maxWidth: "240px", lineHeight: 1.4 }}>
                {quote}
              </p>

              {streak && streak >= 2 && (
                <div
                  style={{
                    padding: "6px 16px",
                    border: `1px solid #FF6B35`,
                    borderRadius: "999px",
                    background: "rgba(255,107,53,0.1)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ color: "#FF6B35", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
                    🔥 {streak} dias
                  </span>
                </div>
              )}

              {/* Recordes Pessoais — o fato do recorde é sempre exibido;
                  o número (kg) só aparece se o aluno ativar o toggle acima. */}
              {prs && prs.length > 0 && (
                <div style={{ width: "100%" }}>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "14px",
                      background: "linear-gradient(135deg, rgba(197,160,89,0.18), rgba(197,160,89,0.04))",
                      border: `1px solid ${GOLD}55`,
                    }}
                  >
                    <p style={{ color: GOLD, fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "6px" }}>
                      🏆 {prs.length === 1 ? "Recorde Pessoal Batido" : `${prs.length} Recordes Pessoais Batidos`}
                    </p>
                    {prs.slice(0, 2).map((pr, i) => (
                      <p key={i} style={{ color: "#fff", fontSize: "13px", fontWeight: 800 }}>
                        {pr.exerciseName}
                        {showLoad ? (
                          <>
                            : <span style={{ color: GOLD }}>{pr.weightKg}kg</span> × {pr.reps}
                          </>
                        ) : (
                          <span style={{ color: GOLD }}> · novo recorde</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stats Grid — Volume Total substitui exposição de carga isolada */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ height: "1px", marginBottom: "14px", background: `linear-gradient(90deg, transparent, ${GOLD}33, transparent)` }} />
              <div style={{ display: "grid", gridTemplateColumns: totalVolumeKg ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: "8px" }}>
                {[
                  { label: "DURAÇÃO", value: fmtDuration(durationSec), accent: true },
                  { label: "SÉRIES", value: String(totalSets), accent: false },
                  { label: "EXERCÍCIOS", value: `${completedExercises}/${totalExercises}`, accent: false },
                  ...(totalVolumeKg
                    ? [{ label: "VOLUME", value: fmtVolume(totalVolumeKg), accent: false }]
                    : []),
                ].map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 6px",
                      background: stat.accent ? `${GOLD}22` : "rgba(255,255,255,0.05)",
                      border: `1px solid ${stat.accent ? `${GOLD}44` : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "10px",
                      textAlign: "center",
                    }}
                  >
                    <p style={{ color: stat.accent ? GOLD : "rgba(255,255,255,0.4)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "3px" }}>
                      {stat.label}
                    </p>
                    <p style={{ color: "#fff", fontSize: "13px", fontWeight: 900, lineHeight: 1 }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé — Coach + marca, dentro da área segura inferior */}
            <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: `1px solid ${BORDER}`, textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "4px" }}>
                Coach <span style={{ color: GOLD }}>{coachName}</span>
              </p>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                www.eliteprimehub.com.br
              </p>
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex justify-center">
            <div className="w-32 h-32 bg-white rounded-lg p-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(qrTrackedUrl)}`}
                alt="QR Code"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em]">
              Escaneia para Juntar-te
            </p>
            <p className="text-sm font-black text-primary italic">
              www.eliteprimehub.com.br
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="space-y-3">
          <Button
            onClick={handleShare}
            disabled={busy}
            className="w-full h-12 rounded-2xl font-black uppercase italic tracking-tighter bg-primary text-black hover:bg-primary/90 gap-2 shadow-lg shadow-primary/30"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
            Compartilhar
          </Button>
          <Button
            onClick={handleSave}
            disabled={busy}
            variant="secondary"
            className="w-full h-12 rounded-2xl font-black uppercase italic tracking-tighter gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            Guardar Imagem
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full h-10 rounded-2xl font-bold text-white/40 uppercase text-[10px] tracking-wider"
          >
            Fechar
          </Button>
        </div>
      </div>
    </motion.div>
  );
}