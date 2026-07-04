// src/components/student/WorkoutShareCard.tsx
// Card de compartilhamento premium — proporcão 4:5 (Instagram nativa)
// Refatorado para Viralidade e Growth (Sprint 6)

import { useRef, useState } from "react";
import { Download, Share2, X, Loader2, Trophy, Flame, Zap } from "lucide-react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Props {
  workoutName:          string;
  durationSec:          number;
  totalSets:            number;
  completedExercises:   number;
  totalExercises:       number;
  coachName?:           string;
  teamName?:            string;
  weekLabel?:           string;
  isPartial?:           boolean;
  heroStat?:            { exerciseName: string; note: string };
  referralUrl?:         string;
  onClose:              () => void;
  // Novos props para viralidade
  userFirstName?:       string;
  isPR?:                boolean;
  streak?:              number;
  coachId?:             string;
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

const GOLD   = "#C9A84C";
const GOLD2  = "#FFE066";
const RED    = "#CC0000";
const BG     = "#080808";
const CARD   = "#141414";
const BORDER = "#2A2A2A";

/* ── SVGs inline ── */

function TrophySVG() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <defs>
        <radialGradient id="tg" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFE066" />
          <stop offset="100%" stopColor="#C9A84C" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#glow)">
        <path d="M18 10 H54 V36 C54 50 46 58 36 58 C26 58 18 50 18 36 Z" fill="url(#tg)" />
        <path d="M18 14 H10 V26 C10 33 14 37 20 37" stroke="#C9A84C" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
        <path d="M54 14 H62 V26 C62 33 58 37 52 37" stroke="#C9A84C" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
        <rect x="30" y="58" width="12" height="8" rx="1" fill="url(#tg)" />
        <rect x="22" y="66" width="28" height="5" rx="2" fill="url(#tg)" />
        <ellipse cx="30" cy="26" rx="5" ry="9" fill="white" opacity="0.15" />
      </g>
    </svg>
  );
}

function StarsSVG() {
  const stars = [
    { x: 12,  y: 8,  r: 1.2, o: 0.6 },
    { x: 62,  y: 12, r: 1.5, o: 0.8 },
    { x: 8,   y: 55, r: 1.0, o: 0.5 },
    { x: 72,  y: 48, r: 1.3, o: 0.7 },
    { x: 40,  y: 5,  r: 1.0, o: 0.4 },
    { x: 78,  y: 22, r: 0.8, o: 0.5 },
    { x: 5,   y: 32, r: 0.9, o: 0.4 },
  ];
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none", width: "100%", height: "60px" }}>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#C9A84C" opacity={s.o} />
      ))}
    </svg>
  );
}

export default function WorkoutShareCard({
  workoutName,
  durationSec,
  totalSets,
  completedExercises,
  totalExercises,
  coachName,
  teamName,
  weekLabel,
  isPartial = false,
  heroStat,
  referralUrl,
  onClose,
  userFirstName,
  isPR,
  streak,
  coachId,
}: Props) {
  const cardRef  = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });

  const generateReferralUrl = (cid?: string): string => {
    if (!cid) return "https://dynamicplanpro.com.br";
    // Rota dedicada de referral landing
    return `https://dynamicplanpro.com.br/c/${cid}`;
  };

  const finalReferralUrl = referralUrl || generateReferralUrl(coachId);

  /* ── Gerar imagem ── */
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

  const slug = (teamName || "dynamic-plan-pro")
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
      const nav  = navigator as unknown as { canShare?: (d: object) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await (navigator as unknown as { share: (d: object) => Promise<void> }).share({
          files: [file],
          title: `Treino concluído — ${teamName || "Dynamic Plan Pro"}`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${slug}-treino.png`; a.click();
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
      a.href = url; a.download = `${slug}-treino.png`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Imagem salva!");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  const workoutLetter = workoutName.split("·")[0]?.trim() ?? workoutName;
  const workoutFocus  = workoutName.includes("·") ? workoutName.split("·")[1]?.trim() : null;
  
  // Copy dinâmico para viralidade
  const getDynamicQuote = () => {
    if (isPR) return "Novo recorde pessoal! 🔥";
    if (streak && streak >= 7) return `${streak} dias de consistência! 🔥`;
    if (completedExercises === totalExercises) return "Treino 100% concluído! 💪";
    return "Consistência é o único atalho.";
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-sm space-y-4 my-auto">

        {/* Header do modal */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base">
            {isPartial ? "Compartilhar progresso" : "Compartilhar resultado"}
          </h3>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ══ CARD 4:5 — gerado como imagem ═══════════════════════════════════ */}
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
          {/* Gradiente radial dourado no topo */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(201,168,76,0.18) 0%, transparent 70%)`,
          }} />

          {/* Linha de brilho topo */}
          <div style={{
            position: "absolute", top: 0, left: "10%", right: "10%", height: "1px",
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          }} />

          {/* Estrelinhas decorativas */}
          <StarsSVG />

          {/* ── Conteúdo ── */}
          <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", padding: "28px 24px 24px" }}>

            {/* Header do card: marca + data */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <p style={{
                  color: GOLD, fontSize: "10px", letterSpacing: "0.22em",
                  fontWeight: 700, textTransform: "uppercase", marginBottom: "2px",
                }}>
                  {(teamName || "Dynamic Plan Pro").toUpperCase()}
                </p>
                {userFirstName && (
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", fontWeight: 700 }}>
                    {userFirstName}
                  </p>
                )}
              </div>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", textAlign: "right" }}>
                {today}
              </p>
            </div>

            {/* ── CENTRO: troféu + textos principais ── */}
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              textAlign: "center", gap: "14px",
            }}>
              {/* Anel + troféu */}
              <div style={{ position: "relative" }}>
                <div style={{
                  width: "120px", height: "120px", borderRadius: "50%",
                  border: `1.5px solid ${GOLD}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 32px ${GOLD}22, inset 0 0 20px rgba(0,0,0,0.6)`,
                  background: `radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)`,
                }}>
                  <div style={{
                    width: "96px", height: "96px", borderRadius: "50%",
                    border: `1px solid ${GOLD}22`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <TrophySVG />
                  </div>
                </div>
                {/* Badge de status */}
                <div style={{
                  position: "absolute", bottom: -6, left: "50%",
                  transform: "translateX(-50%)",
                  background: isPartial ? GOLD : "#22c55e",
                  borderRadius: "999px", padding: "3px 12px",
                  border: `1.5px solid ${BG}`,
                }}>
                  <p style={{ color: "#000", fontSize: "9px", fontWeight: 800, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                    {isPartial ? "EM PROGRESSO" : "CONCLUÍDO"}
                  </p>
                </div>
              </div>

              {/* Título do treino */}
              <div style={{ marginTop: "10px" }}>
                <p style={{
                  color: "rgba(255,255,255,0.45)", fontSize: "11px",
                  letterSpacing: "0.15em", fontWeight: 600, textTransform: "uppercase",
                  marginBottom: "4px",
                }}>
                  Treino
                </p>
                <p style={{
                  color: "#fff", fontSize: "38px", fontWeight: 900,
                  lineHeight: 1, letterSpacing: "-1px",
                }}>
                  {workoutLetter}
                </p>
                {workoutFocus && (
                  <p style={{
                    color: GOLD, fontSize: "13px", fontWeight: 600,
                    marginTop: "2px", letterSpacing: "0.04em",
                  }}>
                    {workoutFocus}
                  </p>
                )}
              </div>

              {/* Citação ou Recorde do dia */}
              {heroStat ? (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: "2px", padding: "8px 16px",
                  background: `${GOLD}12`,
                  border: `1px solid ${GOLD}44`,
                  borderRadius: "12px",
                  maxWidth: "260px",
                }}>
                  <p style={{
                    color: GOLD, fontSize: "10px", fontWeight: 800,
                    letterSpacing: "0.15em", textTransform: "uppercase",
                  }}>
                    🏆 Recorde do dia
                  </p>
                  <p style={{ color: "#fff", fontSize: "13px", fontWeight: 700, lineHeight: 1.3, textAlign: "center" }}>
                    {heroStat.exerciseName}
                  </p>
                  <p style={{ color: GOLD2, fontSize: "14px", fontWeight: 800, lineHeight: 1 }}>
                    {heroStat.note}
                  </p>
                </div>
              ) : (
                <p style={{
                  color: GOLD2, fontSize: "16px", fontWeight: 800,
                  fontStyle: "italic", letterSpacing: "0.02em", maxWidth: "220px",
                  lineHeight: 1.5,
                }}>
                  "{getDynamicQuote()}"
                </p>
              )}

              {/* Streak badge */}
              {streak && streak >= 2 && (
                <div style={{
                  padding: "4px 14px",
                  border: `1px solid #FF6B35`,
                  borderRadius: "999px",
                  background: `rgba(255,107,53,0.1)`,
                  display: "flex", alignItems: "center", gap: "4px"
                }}>
                  <span style={{ color: "#FF6B35", fontSize: "10px", fontWeight: 900 }}>
                    🔥 {streak} DIAS SEGUIDOS
                  </span>
                </div>
              )}
            </div>

            {/* ── Stats grid ── */}
            <div style={{ marginTop: "8px" }}>
              <div style={{
                height: "1px", marginBottom: "14px",
                background: `linear-gradient(90deg, transparent, ${GOLD}33, transparent)`,
              }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {[
                  { label: "DURAÇÃO",    value: fmtDuration(durationSec), accent: true  },
                  { label: "SÉRIES",     value: String(totalSets),         accent: false },
                  { label: "EXERCÍCIOS", value: `${completedExercises}/${totalExercises}`, accent: false },
                ].map((stat, i) => (
                  <div key={i} style={{
                    background: CARD,
                    border: `1px solid ${stat.accent ? GOLD + "44" : BORDER}`,
                    borderRadius: "10px",
                    padding: "10px 8px",
                    textAlign: "center",
                    boxShadow: stat.accent ? `0 0 12px ${GOLD}18` : "none",
                  }}>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "4px" }}>
                      {stat.label}
                    </p>
                    <p style={{ color: stat.accent ? GOLD : "#fff", fontSize: "13px", fontWeight: 800, tabularNums: true }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé com Branding do Coach */}
            <div style={{
              marginTop: "20px", display: "flex",
              alignItems: "center", justifyContent: "space-between",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "12px",
              padding: "12px",
              border: "1px solid rgba(255,255,255,0.05)"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em" }}>
                  TREINO POR
                </p>
                <p style={{ color: GOLD, fontSize: "12px", fontWeight: 800 }}>
                  {coachName || "Dynamic Plan Pro"}
                </p>
              </div>
              
              {finalReferralUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ color: "#fff", fontSize: "9px", fontWeight: 800 }}>TREINE COMIGO</p>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "7px" }}>Escaneie o QR</p>
                  </div>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(finalReferralUrl)}&color=C9A84C&bgcolor=080808`}
                    alt="QR"
                    width={40}
                    height={40}
                    crossOrigin="anonymous"
                    style={{ borderRadius: "4px", border: `1px solid ${GOLD}44` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Brilhos laterais */}
          <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: "1px", background: `linear-gradient(180deg, transparent, ${GOLD}22, transparent)` }} />
          <div style={{ position: "absolute", right: 0, top: "20%", bottom: "20%", width: "1px", background: `linear-gradient(180deg, transparent, ${GOLD}22, transparent)` }} />
        </div>

        {/* ── Botões ── */}
        <div className="space-y-2">
          <Button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className="w-full h-14 font-black rounded-2xl gap-2 text-lg shadow-xl shadow-red-900/20"
            style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)`, color: "#fff" }}
          >
            {busy
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Share2 className="w-5 h-5" />}
            Compartilhar no Instagram
          </Button>
          
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={busy}
              className="h-12 rounded-2xl gap-2 font-bold border-white/10 bg-white/5"
            >
              <Download className="w-4 h-4" />
              Salvar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-12 rounded-2xl text-white/40 hover:text-white"
            >
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
