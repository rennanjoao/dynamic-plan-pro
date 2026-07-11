// src/components/student/CompactWeekSelector.tsx
// Seletor de semana compacto e colapsável — otimizado para mobile

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { WeekMeta } from "@/lib/periodizationDefaults";

interface CompactWeekSelectorProps {
  isPeriodizationOn: boolean;
  weeks: WeekMeta[];
  activeWeek: number;
  onWeekChange: (week: number) => void;
}

const GOLD = "#C9A84C";

export function CompactWeekSelector({
  isPeriodizationOn,
  weeks,
  activeWeek,
  onWeekChange,
}: CompactWeekSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isPeriodizationOn || !weeks || weeks.length === 0) return null;

  const currentWeek = weeks[activeWeek];
  if (!currentWeek) return null;

  const weekSubtitle = currentWeek.label.includes("—")
    ? currentWeek.label.split("—")[1]?.trim()
    : currentWeek.label;

  return (
    <div className="space-y-2">
      <motion.button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all"
        style={{
          background: isExpanded ? `${GOLD}12` : "rgba(201,168,76,0.08)",
          border: `1px solid ${isExpanded ? `${GOLD}44` : "rgba(201,168,76,0.2)"}`,
        }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-bold text-white/60">Semana</span>
          <span className="text-sm font-black text-white">{activeWeek + 1}</span>
          <span className="text-[11px] text-white/40 truncate">{weekSubtitle}</span>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} className="shrink-0">
          <ChevronDown className="w-4 h-4 text-white/50" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden space-y-3 pt-1"
          >
            <div className="grid grid-cols-4 gap-1.5 px-1">
              {weeks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { onWeekChange(i); setIsExpanded(false); }}
                  className={`py-2 rounded-lg text-[11px] font-bold border transition ${
                    activeWeek === i ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border"
                  }`}
                >
                  S{i + 1}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 px-1 pt-2 border-t border-white/10">
              {["sets", "reps", "rest", "cadence"].map((k) => (
                <div key={k} className="text-center">
                  <p className="text-[8px] uppercase text-white/40 font-bold">{k}</p>
                  <p className="text-[10px] font-bold text-white mt-1">{(currentWeek as any)[k] || "—"}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
