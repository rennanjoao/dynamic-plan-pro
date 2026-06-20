import { useRef, useState } from "react";
import { Download, Share2, X, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  workoutName: string;
  durationSec: number;
  totalSets: number;
  completedExercises: number;
  totalExercises: number;
  coachName?: string;
  teamName?: string;
  weekLabel?: string;
  onClose: () => void;
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}min`;
  }
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

function CrownSVG() {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 5 L7 14 L14 3 L21 14 L26 5 L24 17 L4 17 Z"
        fill="#C9A84C"
        stroke="#C9A84C"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="3" r="1.5" fill="#C9A84C" />
    </svg>
  );
}

/** Troféu dentro de anel dourado — mais elegante para redes sociais */
function TrophyRing() {
  const gold = "#C9A84C";
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Anel externo */}
      <circle cx="48" cy="48" r="46" stroke={gold} strokeWidth="2" opacity="0.35" />
      {/* Anel interno */}
      <circle cx="48" cy="48" r="40" stroke={gold} strokeWidth="1" opacity="0.2" />
      {/* Fundo do anel */}
      <circle cx="48" cy="48" r="43" fill="#1A1300" opacity="0.7" />
      {/* Troféu centralizado */}
      <g transform="translate(16, 14)">
        <path d="M14 8 H50 V28 C50 38 42 46 32 46 C22 46 14 38 14 28 Z" fill={gold} />
        <path d="M14 12 H6 V20 C6 26 10 30 16 30" stroke={gold} strokeWidth="3" fill="none" />
        <path d="M50 12 H58 V20 C58 26 54 30 48 30" stroke={gold} strokeWidth="3" fill="none" />
        <rect x="26" y="46" width="12" height="10" fill={gold} />
        <rect x="18" y="56" width="28" height="6" rx="1" fill={gold} />
        <rect x="14" y="62" width="36" height="6" rx="1" fill={gold} />
        <circle cx="32" cy="24" r="6" fill="#0A0A0A" opacity="0.25" />
      </g>
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
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const gold   = "#C9A84C";
  const red    = "#CC0000";
  const bg     = "#0A0A0A";
  const card1  = "#1A1A1A";
  const divider = "#2A2A2A";

  const generateBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: bg,
      scale: 3,
      useCORS: true,
      logging: false,
    });
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  };

  const handleShare = async () => {
    try {
      setBusy(true);
      const blob = await generateBlob();
      if (!blob) throw new Error("falha");
      const fileSlug = (teamName || "Elite Prime Hub")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "treino";
      const file = new File([blob], `${fileSlug}-treino.png`, { type: "image/png" });
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Treino concluído — ${teamName || "Elite Prime Hub"}` } as any);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileSlug}-treino.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.info("Compartilhamento não suportado neste navegador. Imagem salva.");
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
      if (!blob) throw new Error("falha");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (teamName || "Elite Prime Hub")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "treino";
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
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md space-y-4 my-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">Treino concluído</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CARD GERADO */}
        <div
          ref={cardRef}
          style={{
            backgroundColor: bg,
            width: "100%",
            aspectRatio: "4/5",
            display: "flex",
            flexDirection: "column",
            padding: "28px 24px 20px",
            borderRadius: "16px",
            border: `1px solid ${divider}`,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Topo: monograma EP + coroa */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
                <span style={{ color: "#fff", fontSize: "28px", fontWeight: 900, lineHeight: 1 }}>E</span>
                <span style={{ color: red, fontSize: "28px", fontWeight: 900, lineHeight: 1 }}>P</span>
              </div>
              <p
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "9px",
                  letterSpacing: "0.2em",
                  fontWeight: 700,
                  marginTop: "4px",
                }}
              >
                {(teamName || "ELITE PRIME HUB").toUpperCase()}
              </p>
              {coachName && (
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", marginTop: "2px" }}>
                  Coach: {coachName}
                </p>
              )}
            </div>
            <CrownSVG />
          </div>

          {/* Centro: troféu com anel + frase */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              textAlign: "center",
            }}
          >
            <TrophyRing />
            <p style={{ color: "#fff", fontSize: "22px", fontWeight: 900, lineHeight: 1.1 }}>
              Treino {workoutName.split("·")[0]?.trim() ?? ""}
              <br />
              <span style={{ color: "#fff" }}>concluído.</span>
            </p>
            <p style={{ color: gold, fontSize: "13px", fontStyle: "italic", fontWeight: 600 }}>
              Consistência é o único atalho.
            </p>
            {weekLabel && (
              <div
                style={{
                  marginTop: "4px",
                  padding: "4px 10px",
                  border: `1px solid ${gold}`,
                  borderRadius: "999px",
                }}
              >
                <p
                  style={{
                    color: gold,
                    fontSize: "10px",
                    letterSpacing: "0.1em",
                    fontWeight: 700,
                  }}
                >
                  {weekLabel.toUpperCase()}
                </p>
              </div>
            )}
          </div>

          {/* Divisor dourado */}
          <div style={{ height: "1px", backgroundColor: gold, opacity: 0.4, margin: "8px 0 12px" }} />

          {/* Stats 2×2 — duração em dourado */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            {[
              { l: "DURAÇÃO",    v: fmtDuration(durationSec), highlight: true },
              { l: "SÉRIES",     v: String(totalSets),         highlight: false },
              { l: "EXERCÍCIOS", v: `${completedExercises} / ${totalExercises}`, highlight: false },
              { l: "TREINO",     v: workoutName,               highlight: false },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: card1,
                  borderRadius: "10px",
                  padding: "10px 12px",
                  border: `1px solid ${s.highlight ? gold + "55" : divider}`,
                }}
              >
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    fontSize: "9px",
                    letterSpacing: "0.15em",
                    fontWeight: 700,
                  }}
                >
                  {s.l}
                </p>
                <p
                  style={{
                    color: s.highlight ? gold : "#fff",
                    fontSize: "14px",
                    fontWeight: 800,
                    marginTop: "2px",
                  }}
                >
                  {s.v}
                </p>
              </div>
            ))}
          </div>

          {/* Rodapé */}
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: 600 }}>
              eliteprimehub.app
            </p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>{today}</p>
          </div>
        </div>

        {/* Botões de ação */}
        <div className="space-y-2">
          <Button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className="w-full h-12 font-bold rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${red}, #8B0000)`, color: "#fff" }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
            Compartilhar no Instagram
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={busy}
            className="w-full h-12 font-bold rounded-2xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Salvar imagem
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="w-full rounded-2xl text-white/60 hover:text-white"
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
