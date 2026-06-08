/**
 * ShoppingList.tsx — Lista de Compras gerada a partir do protocolo ativo do aluno.
 *
 * Lê meals[].options[].items[] do protocolo, agrupa por categoria (carb/protein/fat/veg)
 * e multiplica as quantidades pelo número de dias escolhido.
 * Exporta em PDF (jsPDF) e compartilha via WhatsApp (wa.me).
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, FileDown, Share2, ShoppingCart, Loader2, AlertCircle } from "lucide-react";
import jsPDF from "jspdf";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const KIND_LABEL: Record<string, string> = {
  carb: "Carboidratos",
  protein: "Proteínas",
  fat: "Gorduras",
  veg: "Legumes & Saladas",
  other: "Outros",
};

function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function parseGrams(it: any): number {
  // Prioridade 1: rawWeight numérico (itens TACO já em gramas cruas)
  if (typeof it?.rawWeight === "number" && it.rawWeight > 0) return it.rawWeight;
  // Prioridade 2: campo weight textual ("150g", "1.5kg", "200ml", "1L")
  const txt = stripHtml(it?.weight || "");
  const m = txt.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)?/i);
  if (!m) return 0;
  let v = Number(m[1].replace(",", "."));
  if (m[2] && /kg|l/i.test(m[2])) v *= 1000;
  return v;
}

function normalizeName(name: string): string {
  return stripHtml(name).toLowerCase().trim();
}

function formatQty(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`;
  return `${Math.round(grams)} g`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Item = { name: string; kind: string; gramsPerDay: number };

const PERIODS = [
  { label: "1 dia", days: 1 },
  { label: "3 dias", days: 3 },
  { label: "1 semana", days: 7 },
  { label: "2 semanas", days: 14 },
  { label: "1 mês", days: 30 },
];

export default function ShoppingList() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({}); // mealId+kind → optionIdx
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) { navigate("/auth"); return; }
      setUserId(data.session.user.id);
      const { data: p } = await supabase
        .from("protocols")
        .select("payload, name")
        .eq("student_id", data.session.user.id)
        .eq("is_template", false)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setProtocol(p);
      setLoading(false);
    });
  }, [navigate]);

  const meals: any[] = useMemo(() => {
    const m = (protocol?.payload as any)?.meals;
    return Array.isArray(m) ? m : [];
  }, [protocol]);

  // Inicializa seleção: primeira opção (índice 0) por (refeição+kind)
  useEffect(() => {
    if (!meals.length) return;
    const init: Record<string, number> = {};
    meals.forEach((meal, mi) => {
      const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
      const kinds = new Set(opts.map((o: any) => o?.kind || "other"));
      kinds.forEach((k) => { init[`${mi}:${k}`] = 0; });
    });
    setSelectedOptions(init);
  }, [meals]);

  // Computa itens agregados
  const aggregated: Item[] = useMemo(() => {
    const map = new Map<string, Item>();
    meals.forEach((meal, mi) => {
      const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
      const byKind: Record<string, any[]> = {};
      opts.forEach((o) => {
        const k = o?.kind || "other";
        (byKind[k] ||= []).push(o);
      });
      Object.entries(byKind).forEach(([kind, list]) => {
        const idx = selectedOptions[`${mi}:${kind}`] ?? 0;
        const chosen = list[idx] || list[0];
        const items: any[] = Array.isArray(chosen?.items) ? chosen.items : [];
        items.forEach((it) => {
          const name = stripHtml(it?.baseName || it?.name || "");
          if (!name) return;
          const grams = parseGrams(it);
          if (!grams) return;
          // Mesmo ingrediente em kinds diferentes (ex: "ovo" como proteína e como gordura)
          // deve agrupar em uma única linha — chave SEM kind.
          const key = normalizeName(name);
          const existing = map.get(key);
          if (existing) existing.gramsPerDay += grams;
          else map.set(key, { name, kind, gramsPerDay: grams });
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [meals, selectedOptions]);

  const grouped: Record<string, Item[]> = useMemo(() => {
    const g: Record<string, Item[]> = {};
    aggregated.forEach((it) => { (g[it.kind] ||= []).push(it); });
    return g;
  }, [aggregated]);

  const toggleCheck = (key: string) => setChecked((c) => ({ ...c, [key]: !c[key] }));

  const buildText = (): string => {
    const lines = [`🛒 Lista de Compras — ${days} ${days === 1 ? "dia" : "dias"}`, ""];
    Object.keys(grouped).sort().forEach((kind) => {
      lines.push(`*${KIND_LABEL[kind] || kind}*`);
      grouped[kind].forEach((it) => {
        const total = it.gramsPerDay * days;
        lines.push(`• ${it.name} — ${formatQty(total)}`);
      });
      lines.push("");
    });
    return lines.join("\n");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    let y = 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Lista de Compras — ${days} ${days === 1 ? "dia" : "dias"}`, 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, 14, y);
    y += 8;

    Object.keys(grouped).sort().forEach((kind) => {
      if (y > 270) { doc.addPage(); y = 18; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(KIND_LABEL[kind] || kind, 14, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      grouped[kind].forEach((it) => {
        if (y > 280) { doc.addPage(); y = 18; }
        const total = it.gramsPerDay * days;
        doc.text(`[ ]  ${it.name}`, 18, y);
        doc.text(formatQty(total), 180, y, { align: "right" });
        y += 6;
      });
      y += 4;
    });

    doc.save(`lista-de-compras-${days}d.pdf`);
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(buildText());
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!meals.length) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="max-w-2xl mx-auto">
          <Link to="/student-area" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Link>
          <Card>
            <CardContent className="p-8 text-center">
              <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-xl font-bold mb-2">Nenhum protocolo ativo</h2>
              <p className="text-sm text-muted-foreground">
                Assim que seu coach cadastrar um protocolo com refeições, sua lista aparecerá aqui.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/student-area" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Lista de Compras</h1>
            <p className="text-sm text-muted-foreground">
              Baseada no protocolo <span className="text-primary">{protocol?.name || "ativo"}</span>
            </p>
          </div>
        </div>

        {/* Período */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">Período</p>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                    days === p.days
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Seletor de opção por refeição/categoria */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">
              Escolha as opções de cada refeição
            </p>
            <div className="space-y-3">
              {meals.map((meal: any, mi: number) => {
                const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
                const byKind: Record<string, any[]> = {};
                opts.forEach((o) => { (byKind[o?.kind || "other"] ||= []).push(o); });
                const kinds = Object.keys(byKind).filter((k) => byKind[k].length > 1);
                if (!kinds.length) return null;
                return (
                  <div key={mi} className="border border-border rounded-lg p-3">
                    <p className="text-sm font-semibold mb-2">{meal.name || `Refeição ${mi + 1}`}</p>
                    {kinds.map((k) => (
                      <div key={k} className="flex flex-wrap items-center gap-2 text-xs mb-1.5">
                        <span className="text-muted-foreground w-20">{KIND_LABEL[k] || k}:</span>
                        {byKind[k].map((_, optIdx) => (
                          <button
                            key={optIdx}
                            onClick={() => setSelectedOptions((s) => ({ ...s, [`${mi}:${k}`]: optIdx }))}
                            className={`px-2 py-1 rounded border transition ${
                              (selectedOptions[`${mi}:${k}`] ?? 0) === optIdx
                                ? "bg-primary/15 border-primary text-primary font-bold"
                                : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            Opção {optIdx + 1}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
              {meals.every((m: any) => {
                const o = Array.isArray(m.options) ? m.options : [];
                const counts: Record<string, number> = {};
                o.forEach((x: any) => { counts[x?.kind || "other"] = (counts[x?.kind || "other"] || 0) + 1; });
                return Object.values(counts).every((c) => c <= 1);
              }) && (
                <p className="text-xs text-muted-foreground italic">
                  Seu protocolo tem apenas uma opção por categoria — nada a escolher.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lista agregada */}
        <Card className="mb-4">
          <CardContent className="p-4 space-y-5">
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-sm font-semibold text-amber-700">
                Quantidades referem-se aos alimentos CRUS
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-600/80">
                Pese antes do preparo. Para itens TACO, o peso cru já foi calculado automaticamente.
              </AlertDescription>
            </Alert>
            {Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum alimento com quantidade definida foi encontrado nas opções selecionadas.
              </p>
            ) : (
              Object.keys(grouped).sort().map((kind) => (
                <div key={kind}>
                  <p className="text-xs uppercase tracking-wider font-bold text-primary mb-2">
                    {KIND_LABEL[kind] || kind}
                  </p>
                  <ul className="space-y-1.5">
                    {grouped[kind].map((it) => {
                      const key = `${kind}:${it.name}`;
                      const total = it.gramsPerDay * days;
                      const isChecked = !!checked[key];
                      return (
                        <li key={key} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleCheck(key)} id={key} />
                          <label
                            htmlFor={key}
                            className={`flex-1 text-sm cursor-pointer ${isChecked ? "line-through text-muted-foreground" : ""}`}
                          >
                            {it.name}
                          </label>
                          <span className="text-sm font-bold tabular-nums text-primary">{formatQty(total)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={exportPDF} variant="outline" disabled={!aggregated.length}>
            <FileDown className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Button onClick={shareWhatsApp} disabled={!aggregated.length}>
            <Share2 className="w-4 h-4 mr-2" /> WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}