// src/components/student/WorkoutShareCard.tsx
// Card de Compartilhamento — Elite Prime Hub (Sprint 11)

import { useEffect, useRef, useState } from "react";
import { Download, Share2, X, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface Props {
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

const GOLD = "#C9A84C";
const BG = "#080808";
const BORDER = "#2A2A2A";

export default function WorkoutShareCard({
  workoutName,
  durationSec,
  totalSets,
  completedExercises,
  totalExercises,
  coachName,
  teamName,
  streak,
  coachId,
  studentId,
  prs,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Busca (ou cria, no backend) o código de indicação único do aluno.
  // Sem isso o QR apontava pra URL genérica e não havia como atribuir quem
  // trouxe um novo aluno — o modelo de bônus de referral ficava inoperável.
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

  // URL rastreada do QR — só inclui ?ref= quando o código já carregou, para
  // não gravar cliques órfãos sem atribuição possível.
  const qrTrackedUrl = referralCode
    ? `https://www.eliteprimehub.com.br?ref=${referralCode}&utm_source=workout_share&utm_medium=qrcode&utm_campaign=student_referral`
    : "https://www.eliteprimehub.com.br";

  const slug = (teamName || "elite-prime-hub")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "treino";

  const handleShare = async () => {
    try {
      setBusy(true);
      const blob = await generateBlob();
      if (!blob) throw new Error();
      const file = new File([blob], `${slug}-treino.png`, { type: "image/png" });
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
        a.download = `${slug}-treino.png`;
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
      a.download = `${slug}-treino.png`;
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

        {/* Card 4:5 */}
        <div
          ref={cardRef}
          style={{
            width: "100%",
            aspectRatio: "4 / 5",
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
              background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(201,168,76,0.18) 0%, transparent 70%)`,
            }}
          />

          {/* Linha de brilho */}
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

          {/* Conteúdo */}
          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "28px 24px 24px",
            }}
          >
            {/* Header: marca + data */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p
                  style={{
                    color: GOLD,
                    fontSize: "10px",
                    letterSpacing: "0.22em",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: "2px",
                  }}
                >
                  ELITE PRIME HUB
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  Performance
                </p>
              </div>
              <p
                style={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "10px",
                  textAlign: "right",
                }}
              >
                {today}
              </p>
            </div>

            {/* Centro: troféu + stats */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "16px",
              }}
            >
              {/* Troféu */}
              <div
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                  border: `2px solid ${GOLD}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "48px",
                  boxShadow: `0 0 30px ${GOLD}33`,
                }}
              >
                🏆
              </div>

              {/* Título */}
              <div>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "11px",
                    letterSpacing: "0.15em",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Treino
                </p>
                <p
                  style={{
                    color: "#fff",
                    fontSize: "42px",
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: "-1px",
                  }}
                >
                  {workoutName}
                </p>
              </div>

              {/* Motivação */}
              <p
                style={{
                  color: GOLD,
                  fontSize: "15px",
                  fontWeight: 800,
                  fontStyle: "italic",
                  letterSpacing: "0.02em",
                  maxWidth: "220px",
                  lineHeight: 1.4,
                }}
              >
                {prs && prs.length > 0 ? "Você superou seus próprios limites." : "Consistência é o único atalho."}
              </p>

              {/* Streak */}
              {streak && streak >= 2 && (
                <div
                  style={{
                    padding: "6px 16px",
                    border: `1px solid #FF6B35`,
                    borderRadius: "999px",
                    background: `rgba(255,107,53,0.1)`,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      color: "#FF6B35",
                      fontSize: "11px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                    }}
                  >
                    🔥 {streak} dias
                  </span>
                </div>
              )}
            </div>

            {/* Recordes Pessoais — o gancho de orgulho que gera compartilhamento espontâneo */}
            {prs && prs.length > 0 && (
              <div style={{ marginTop: "12px" }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.04))",
                    border: `1px solid ${GOLD}55`,
                  }}
                >
                  <p style={{ color: GOLD, fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "6px" }}>
                    🏆 {prs.length === 1 ? "Recorde Pessoal Batido" : `${prs.length} Recordes Pessoais Batidos`}
                  </p>
                  {prs.slice(0, 2).map((pr, i) => (
                    <p key={i} style={{ color: "#fff", fontSize: "13px", fontWeight: 800 }}>
                      {pr.exerciseName}: <span style={{ color: GOLD }}>{pr.weightKg}kg</span> × {pr.reps}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  height: "1px",
                  marginBottom: "14px",
                  background: `linear-gradient(90deg, transparent, ${GOLD}33, transparent)`,
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "8px",
                }}
              >
                {[
                  {
                    label: "DURAÇÃO",
                    value: fmtDuration(durationSec),
                    accent: true,
                  },
                  { label: "SÉRIES", value: String(totalSets), accent: false },
                  {
                    label: "EXERCÍCIOS",
                    value: `${completedExercises}/${totalExercises}`,
                    accent: false,
                  },
                ].map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 8px",
                      background: stat.accent
                        ? `${GOLD}22`
                        : "rgba(255,255,255,0.05)",
                      border: `1px solid ${stat.accent ? `${GOLD}44` : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "10px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        color: stat.accent
                          ? GOLD
                          : "rgba(255,255,255,0.4)",
                        fontSize: "8px",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        marginBottom: "3px",
                      }}
                    >
                      {stat.label}
                    </p>
                    <p
                      style={{
                        color: "#fff",
                        fontSize: "14px",
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé */}
            <div
              style={{
                marginTop: "16px",
                paddingTop: "12px",
                borderTop: `1px solid ${BORDER}`,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "9px",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                }}
              >
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
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Share2 className="w-5 h-5" />
            )}
            Compartilhar
          </Button>
          <Button
            onClick={handleSave}
            disabled={busy}
            variant="secondary"
            className="w-full h-12 rounded-2xl font-black uppercase italic tracking-tighter gap-2"
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
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
