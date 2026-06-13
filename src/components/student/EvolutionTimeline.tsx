/**
 * EvolutionTimeline.tsx
 * Timeline vertical estilo feed com Gráfico de Evolução.
 */

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CHECKIN_METRICS, CHECKIN_SECTIONS } from "@/lib/checkInSchema";
import type { CheckIn } from "@/hooks/useStudentData";
import { MessageSquare, TrendingDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Props {
  checkIns: CheckIn[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short"
  });
}

export default function EvolutionTimeline({ checkIns }: Props) {
  const [selected, setSelected] = useState<CheckIn | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Prepara os dados do gráfico (ordem cronológica: do mais antigo para o mais novo)
  const chartData = useMemo(() => {
    if (!checkIns || checkIns.length === 0) return [];
    return [...checkIns].reverse().map(c => ({
      date: fmtDate(c.submitted_at),
      peso: c.current_metrics?.peso || 0,
    })).filter(d => d.peso > 0);
  }, [checkIns]);

  if (checkIns.length === 0) {
    return (
      <Card className="bg-card/60 border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum check-in ainda. Seus envios aparecerão aqui em ordem cronológica.
        </p>
      </Card>
    );
  }

  const prevOfSelected = selectedIndex >= 0 ? checkIns[selectedIndex + 1] ?? null : null;

  return (
    <div className="space-y-6">
      {/* GRÁFICO DE EVOLUÇÃO */}
      {chartData.length > 1 && (
        <Card className="bg-card/60 border-border p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Curva de Peso</h3>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPeso" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="peso" name="Peso (kg)" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorPeso)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* TIMELINE DE CHECK-INS */}
      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
        <div className="space-y-4">
          {checkIns.map((c, i) => {
            const prev = checkIns[i + 1] ?? null;
            const top = CHECKIN_METRICS.slice(0, 3);
            return (
              <div key={c.id} className="relative">
                <div className="absolute -left-4 top-3 w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                <button
                  type="button"
                  onClick={() => { setSelected(c); setSelectedIndex(i); }}
                  className="block w-full text-left"
                >
                  <Card className="bg-card/60 border-border p-4 hover:border-primary/50 hover:bg-card/80 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-foreground">
                        {new Date(c.submitted_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Check-in #{checkIns.length - i}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      {top.map((m) => {
                        const v = c.current_metrics?.[m.key];
                        const pv = prev?.current_metrics?.[m.key];
                        const d = typeof v === "number" && typeof pv === "number" ? v - pv : null;
                        return (
                          <div key={m.key} className="bg-background/50 rounded-lg p-2 text-center">
                            <div className="text-[10px] uppercase text-muted-foreground">{m.label}</div>
                            <div className="text-sm font-bold text-foreground tabular-nums">
                              {typeof v === "number" ? `${v}${m.unit}` : "—"}
                            </div>
                            {d != null && Math.abs(d) >= 0.05 && (
                              <div className={`text-[10px] tabular-nums ${d < 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                {d > 0 ? "+" : ""}{d.toFixed(1)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Miniaturas de fotos do check-in */}
                    {(() => {
                      const fotos = (c.payload as any)?.fotos as Record<string, string> | undefined;
                      const urls = fotos ? Object.values(fotos).filter(Boolean) : [];
                      if (urls.length === 0) return null;
                      return (
                        <div className="grid grid-cols-4 gap-1.5 mt-1">
                          {urls.map((url, idx) => (
                            <img key={idx} src={url} alt={`foto-${idx}`} className="w-full aspect-[3/4] object-cover rounded-lg border border-border/40" />
                          ))}
                        </div>
                      );
                    })()}
                  </Card>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DE DETALHES (Mantido exatamente como estava) */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Check-in — {fmtDate(selected.submitted_at)}</DialogTitle>
              </DialogHeader>
              {/* Fotos do check-in no modal */}
              {(() => {
                const fotos = (selected.payload as any)?.fotos as Record<string, string> | undefined;
                const LABELS: Record<string, string> = { frente: "Frente", lateral_dir: "Lateral Dir.", lateral_esq: "Lateral Esq.", costas: "Costas" };
                const entries = fotos ? Object.entries(fotos).filter(([, v]) => Boolean(v)) : [];
                if (entries.length === 0) return null;
                return (
                  <div className="mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Fotos</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {entries.map(([key, url]) => (
                        <div key={key} className="space-y-1">
                          <img src={url} alt={key} className="w-full aspect-[3/4] object-cover rounded-xl border border-border/40" />
                          <p className="text-[10px] text-center text-muted-foreground">{LABELS[key] ?? key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {selected.coach_feedback && (
                <div className="mt-4 border-t border-border pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Retorno do Coach
                  </h3>
                  <p className="text-sm whitespace-pre-wrap text-foreground/85 bg-primary/5 rounded-lg p-3 border border-primary/20">
                    {selected.coach_feedback}
                  </p>
                </div>
              )}

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
