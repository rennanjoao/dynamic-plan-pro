/**
 * ProtocolImportExport.tsx
 *
 * FIX: sanitizePayload() aplicado antes de exportar JSON/XLSX.
 * Remove HTML injetado em item.name, corrige kind inválido para "carb",
 * garante campos rawWeight/baseName/isTaco em todos os itens.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, Upload, FileSpreadsheet, FileJson, Settings2, ChevronDown } from "lucide-react";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";
import { exportProtocolXlsx, importProtocolXlsx, ProtocolXlsxError } from "@/lib/protocolXlsx";
import { fuzzyFindTaco, parseRawWeight } from "@/lib/macroCalc";
import { toast } from "sonner";

interface Props {
  payload: ProtocolPayload | null;
  studentName: string;
  onImport: (next: ProtocolPayload) => void;
}

// Aplica fuzzy match nos itens de todas as refeições (mutação imutável)
function applyFuzzyTacoMatch(p: ProtocolPayload): { next: ProtocolPayload; matched: number; unmatched: string[] } {
  let matched = 0;
  const unmatched: string[] = [];
  const meals = (p.meals || []).map((meal: any) => {
    const options = (meal.options || []).map((opt: any) => {
      const items = (opt.items || []).map((it: any) => {
        if (it?.isTaco) return it;
        const raw = it?.baseName || it?.name || "";
        if (!raw) return it;
        const found = fuzzyFindTaco(raw);
        if (found) {
          matched++;
          const rawWeight = typeof it.rawWeight === "number" && it.rawWeight > 0
            ? it.rawWeight
            : parseRawWeight(it.weight || "");
          return {
            ...it,
            name: found.taco.name,
            baseName: found.taco.name,
            isTaco: true,
            cookFactor: found.taco.cookFactor ?? 1,
            rawWeight: rawWeight || 100,
          };
        }
        unmatched.push(raw);
        return it;
      });
      return { ...opt, items };
    });
    return { ...meal, options };
  });
  return { next: { ...p, meals } as ProtocolPayload, matched, unmatched };
}

// ─── HTML stripper ────────────────────────────────────────────────────────────
function stripHtml(str: string): string {
  return (str || "")
    .replace(/<[^>]*>/g, "")
    .replace(/class\s*=\s*["'][^"']*["']/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Detects if a string looks like an HTML-injected field ───────────────────
function looksInjected(str: string): boolean {
  return /<[a-z]/i.test(str || "");
}

// ─── Extracts clean text + raw/cooked weights from legacy HTML-injected names ─
// Pattern: <span class='peso-cru'>Xg (CRU)</span><span class='peso-pronto'>Yg (PRONTO)</span> Nome
function parseInjectedItem(raw: string): { name: string; rawWeight: number; displayWeight: string } {
  const cruMatch  = raw.match(/peso-cru[^>]*>(\d+)g?\s*\(CRU\)/i);
  const prontoMatch = raw.match(/peso-pronto[^>]*>(\d+)g?\s*\(PRONTO\)/i);
  const rawW = cruMatch   ? Number(cruMatch[1])   : 0;
  const displayW = prontoMatch ? `${prontoMatch[1]}g` : "";
  const name = stripHtml(raw).replace(/\d+g?\s*\(CRU\)/gi, "").replace(/\d+g?\s*\(PRONTO\)/gi, "").trim();
  return { name, rawWeight: rawW, displayWeight: displayW };
}

const VALID_KINDS = new Set(["carb", "protein", "fat", "veg"]);

// ─── Sanitize full payload before export ─────────────────────────────────────
function sanitizePayload(p: ProtocolPayload): ProtocolPayload {
  const meals = (p.meals || []).map((meal: any) => {
    const options = (meal.options || []).map((opt: any) => {
      // Fix kind
      const kind = VALID_KINDS.has(opt.kind) ? opt.kind : "carb";

      const items = (opt.items || []).map((it: any) => {
        const rawName: string = it.name || it.baseName || "";

        if (looksInjected(rawName)) {
          // Legacy HTML-injected item — extract data cleanly
          const { name, rawWeight, displayWeight } = parseInjectedItem(rawName);
          return {
            name,
            baseName: name,
            weight: it.weight || displayWeight,
            rawWeight: it.rawWeight || rawWeight,
            cookFactor: it.cookFactor ?? 1,
            isTaco: it.isTaco ?? (rawWeight > 0),
          };
        }

        return {
          name: stripHtml(rawName),
          baseName: stripHtml(it.baseName || rawName),
          weight: stripHtml(it.weight || ""),
          rawWeight: it.rawWeight ?? 0,
          cookFactor: it.cookFactor ?? 1,
          isTaco: it.isTaco ?? false,
        };
      });

      return { ...opt, kind, items };
    });

    return {
      ...meal,
      options,
      notes: stripHtml(meal.notes || ""),
    };
  });

  return { ...p, meals } as ProtocolPayload;
}

// ─── Template wrapper ─────────────────────────────────────────────────────────
function buildTemplateNotes(p: ProtocolPayload) {
  return {
    _instructions: [
      "Edite os campos abaixo no PC, IA ou editor de texto e salve novamente como JSON.",
      "Mantenha a mesma estrutura. Campos opcionais podem ficar vazios.",
      "Importe de volta pelo painel do Coach > Protocolo > Importar.",
    ],
    payload: sanitizePayload(p),
  };
}

export default function ProtocolImportExport({ payload, studentName, onImport }: Props) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const ensurePayload = (): ProtocolPayload =>
    payload ??
    ProtocolPayloadSchema.parse({
      setup: { split: "ABC", mealsCount: 5, carbCycle: false },
    });

  const downloadJson = () => {
    const data = buildTemplateNotes(ensurePayload());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = studentName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `protocolo-esboco-${safe || "aluno"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadXlsx = () => {
    try {
      exportProtocolXlsx(sanitizePayload(ensurePayload()), studentName);
    } catch (e) {
      toast.error("Falha ao gerar Excel: " + (e instanceof Error ? e.message : ""));
    }
  };

  const onJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const candidate = raw?.payload && typeof raw.payload === "object" ? raw.payload : raw;
      // Sanitize before parsing to avoid schema rejection on dirty legacy data
      const sanitized = sanitizePayload(candidate as ProtocolPayload);
      let parsed: ProtocolPayload;
      const safe = ProtocolPayloadSchema.safeParse(sanitized);
      if (safe.success) {
        parsed = safe.data;
      } else {
        const fallback = ProtocolPayloadSchema.parse({
          setup: sanitized?.setup ?? {},
          macros: sanitized?.macros ?? {},
          guidelines: sanitized?.guidelines ?? {},
          workouts: Array.isArray(sanitized?.workouts) ? sanitized.workouts : [],
          meals: Array.isArray(sanitized?.meals) ? sanitized.meals : [],
          carbCycle: sanitized?.carbCycle ?? {},
          carbCycleNotes: sanitized?.carbCycleNotes ?? {},
        });
        parsed = fallback;
        const issues = safe.error.issues.slice(0, 3).map((i) => i.path.join(".") || "raiz").join(", ");
        toast.warning("Importado com adaptações", {
          description: `Alguns campos foram normalizados (${issues}). Revise antes de salvar.`,
          duration: 6000,
        });
      }
      const fuzzy = applyFuzzyTacoMatch(parsed);
      onImport(fuzzy.next);
      if (fuzzy.matched > 0) {
        toast.success(`JSON importado — ${fuzzy.matched} alimento(s) vinculados à TACO.`);
      } else {
        toast.success("Esboço JSON importado. Revise e salve.");
      }
      if (fuzzy.unmatched.length > 0) {
        toast.warning(`${fuzzy.unmatched.length} item(ns) sem correspondência TACO`, {
          description: fuzzy.unmatched.slice(0, 3).join(" • ") + (fuzzy.unmatched.length > 3 ? "…" : ""),
          duration: 7000,
        });
      }
    } catch (err) {
      console.error("import json error", err);
      toast.error("JSON inválido: " + (err instanceof Error ? err.message : "formato"));
    } finally {
      if (jsonRef.current) jsonRef.current.value = "";
    }
  };

  const onXlsxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importProtocolXlsx(file);
      const fuzzy = applyFuzzyTacoMatch(parsed);
      onImport(fuzzy.next);
      toast.success(`Planilha importada — ${parsed.meals.length} refeição(ões). ${fuzzy.matched} item(ns) TACO.`);
      if (fuzzy.unmatched.length > 0) {
        toast.warning(`${fuzzy.unmatched.length} item(ns) sem correspondência TACO`, {
          description: fuzzy.unmatched.slice(0, 3).join(" • ") + (fuzzy.unmatched.length > 3 ? "…" : ""),
          duration: 7000,
        });
      }
    } catch (err) {
      console.error("import xlsx error", err);
      if (err instanceof ProtocolXlsxError) {
        toast.error(err.message, {
          description: err.details.length ? err.details.join(" • ") : undefined,
          duration: 7000,
        });
      } else {
        toast.error("Excel inválido: " + (err instanceof Error ? err.message : "formato desconhecido"));
      }
    } finally {
      if (xlsxRef.current) xlsxRef.current.value = "";
    }
  };

  return (
    <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="inline-block">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
        >
          <Settings2 className="w-3 h-3" />
          Modo avançado · JSON / Excel
          <ChevronDown className={`w-3 h-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap items-center gap-1.5 mt-2 p-2 rounded-lg bg-muted/20 border border-border/40">
          <Button variant="outline" size="sm" onClick={downloadXlsx} type="button" title="Baixar esboço .xlsx">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => xlsxRef.current?.click()} type="button" title="Importar .xlsx">
            <Upload className="w-3.5 h-3.5 mr-1.5" /> Importar Excel
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadJson} type="button" title="Baixar JSON">
            <FileJson className="w-3.5 h-3.5 mr-1.5" /> JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => jsonRef.current?.click()} type="button" title="Importar JSON">
            <Download className="w-3.5 h-3.5 rotate-180 mr-1.5" /> Importar JSON
          </Button>
          <input ref={xlsxRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onXlsxFile} />
          <input ref={jsonRef} type="file" accept="application/json,.json" className="hidden" onChange={onJsonFile} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
