/**
 * ProtocolImportExport.tsx
 *
 * FIX: sanitizePayload() aplicado antes de exportar JSON/XLSX.
 * Remove HTML injetado em item.name, corrige kind inválido inferindo pelo
 * group TACO do alimento (protein→protein, fat→fat, demais→carb),
 * garante campos rawWeight/baseName/isTaco em todos os itens.
 *
 * FIX2: applyFuzzyTacoMatch() agora também corrige o kind da opção
 * usando o group do alimento TACO encontrado — evita que "Frango peito"
 * apareça no card de Carboidrato após import.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, Upload, FileSpreadsheet, FileJson, Settings2, ChevronDown } from "lucide-react";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";
import { exportProtocolXlsx, importProtocolXlsx, ProtocolXlsxError } from "@/lib/protocolXlsx";
import { fuzzyFindTaco, parseRawWeight } from "@/lib/macroCalc";
import {
  validateAndMapImport,
  applyResolutions,
  type ImportAnomaly,
  type Resolution,
} from "@/lib/protocolImportValidator";
import ProtocolImportResolverModal from "./ProtocolImportResolverModal";
import ProtocolImportPreview from "./ProtocolImportPreview";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  payload: ProtocolPayload | null;
  studentName: string;
  onImport: (next: ProtocolPayload) => void;
  studentId?: string | null;
}

/** Estados explícitos da máquina de estados do fluxo de importação. */
type ImportState =
  | { stage: "IDLE" }
  | { stage: "VALIDATING"; fileName: string }
  | { stage: "RESOLVING_ANOMALIES"; fileName: string; payload: ProtocolPayload; anomalies: ImportAnomaly[]; cycleActivated: boolean }
  | { stage: "PREVIEW"; fileName: string; payload: ProtocolPayload; cycleActivated: boolean; hadAnomalies: boolean; resolvedItems: Resolution[] }
  | { stage: "COMMITTING"; fileName: string; payload: ProtocolPayload; cycleActivated: boolean; hadAnomalies: boolean; resolvedItems: Resolution[] }
  | { stage: "SUCCESS" };

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Mapeia group da TACO para kind do protocolo
// Ex: group "protein" → kind "protein", group "fat" → kind "fat", demais → "carb"
function tacoGroupToKind(group: string): "carb" | "protein" | "fat" {
  if (group === "protein") return "protein";
  if (group === "fat") return "fat";
  return "carb"; // carb, veg, fruit, dairy, other → seção carbo por padrão
}

// Aplica fuzzy match nos itens de todas as refeições (mutação imutável)
// TAMBÉM corrige o kind da opção usando o group TACO do primeiro item correspondido,
// para evitar que "Frango peito" (group:protein) apareça no card de Carboidrato.
function applyFuzzyTacoMatch(p: ProtocolPayload): { next: ProtocolPayload; matched: number; unmatched: string[] } {
  let matched = 0;
  const unmatched: string[] = [];
  const meals = (p.meals || []).map((meal: any) => {
    const options = (meal.options || []).map((opt: any) => {
      let inferredKind: "carb" | "protein" | "fat" | null = null;
      const items = (opt.items || []).map((it: any) => {
        if (it?.isTaco) {
          // Já era TACO — ainda assim inferir kind se ainda não temos
          if (!inferredKind) {
            const existing = fuzzyFindTaco(it.baseName || it.name || "");
            if (existing) inferredKind = tacoGroupToKind(existing.taco.group);
          }
          return it;
        }
        const raw = it?.baseName || it?.name || "";
        if (!raw) return it;
        const found = fuzzyFindTaco(raw);
        if (found) {
          matched++;
          // Usa o group do primeiro item TACO encontrado para definir o kind da opção
          if (!inferredKind) inferredKind = tacoGroupToKind(found.taco.group);
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
      // Corrige kind da opção se inferimos um a partir dos alimentos TACO encontrados
      const correctedKind = inferredKind ?? (VALID_KINDS.has(opt.kind) ? opt.kind : null);
      return { ...opt, ...(correctedKind ? { kind: correctedKind } : {}), items };
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
      // Determina o kind: usa o declarado se válido.
      // Se inválido/ausente, tenta inferir pelo group TACO do primeiro item com match.
      let kind: "carb" | "protein" | "fat" | "veg" = VALID_KINDS.has(opt.kind)
        ? opt.kind
        : "carb"; // fallback provisório — será corrigido abaixo se possível

      if (!VALID_KINDS.has(opt.kind)) {
        for (const it of opt.items || []) {
          const name = it.baseName || it.name || "";
          if (!name) continue;
          const found = fuzzyFindTaco(name);
          if (found) {
            kind = tacoGroupToKind(found.taco.group);
            break;
          }
        }
      }

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
  const [importState, setImportState] = useState<ImportState>({ stage: "IDLE" });

  /**
   * Persistência final — só roda dentro do estágio COMMITTING.
   * 1) Aplica fuzzy TACO match (cópia imutável).
   * 2) Injeta o payload no protocolo (callback do pai).
   * 3) Grava log em `protocol_import_logs` (best-effort).
   */
  const commit = async (s: Extract<ImportState, { stage: "COMMITTING" }>) => {
    const fuzzy = applyFuzzyTacoMatch(s.payload);
    onImport(fuzzy.next);

    if (fuzzy.matched > 0) toast.success(`Importação confirmada — ${fuzzy.matched} alimento(s) vinculados à TACO.`);
    else toast.success("Importação confirmada.");
    if (s.cycleActivated) toast.info("Ciclagem de carboidratos ativada automaticamente.");
    if (fuzzy.unmatched.length > 0) {
      toast.warning(`${fuzzy.unmatched.length} item(ns) sem correspondência TACO`, {
        description: fuzzy.unmatched.slice(0, 3).join(" • ") + (fuzzy.unmatched.length > 3 ? "…" : ""),
        duration: 7000,
      });
    }

    try {
      const { data: auth } = await supabase.auth.getUser();
      const coachId = auth?.user?.id;
      if (coachId) {
        await supabase.from("protocol_import_logs" as any).insert({
          coach_id: coachId,
          student_id: null,
          file_name: s.fileName,
          status: s.hadAnomalies ? "resolved_with_warnings" : "success",
          anomalies_count: s.resolvedItems.length,
          resolved_items: s.resolvedItems,
        });
      }
    } catch (err) {
      console.warn("import log insert failed", err);
    }

    setImportState({ stage: "SUCCESS" });
    // Auto-reset para IDLE no próximo tick
    setTimeout(() => setImportState({ stage: "IDLE" }), 0);
  };

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
    setImportState({ stage: "VALIDATING", fileName: file.name });
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const candidate = raw?.payload && typeof raw.payload === "object" ? raw.payload : raw;

      // ─── Validation Layer ─────────────────────────────────────────────
      // 1) Smart mapping estrito por `kind` (carb→carb, protein→protein, fat→fat)
      // 2) Detecção e ativação do carbCycle
      // 3) Coleta de anomalias (orphan data) para resolução manual
      const validation = validateAndMapImport(candidate);

      // Sanitize after validation (preserva mapeamentos por kind)
      const sanitized = sanitizePayload(validation.payload);
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

      // Clone profundo antes de qualquer estágio interativo
      const cloned = deepClone(parsed);

      if (validation.anomalies.length > 0) {
        setImportState({
          stage: "RESOLVING_ANOMALIES",
          fileName: file.name,
          payload: cloned,
          anomalies: validation.anomalies,
          cycleActivated: validation.cycleActivated,
        });
      } else {
        setImportState({
          stage: "PREVIEW",
          fileName: file.name,
          payload: cloned,
          cycleActivated: validation.cycleActivated,
          hadAnomalies: false,
          resolvedItems: [],
        });
      }
    } catch (err) {
      console.error("import json error", err);
      toast.error("JSON inválido: " + (err instanceof Error ? err.message : "formato"));
      // Log de erro
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user?.id) {
          await supabase.from("protocol_import_logs" as any).insert({
            coach_id: auth.user.id,
            file_name: file.name,
            status: "error",
            anomalies_count: 0,
            resolved_items: [],
          });
        }
      } catch { /* noop */ }
      setImportState({ stage: "IDLE" });
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
      <ProtocolImportResolverModal
        open={importState.stage === "RESOLVING_ANOMALIES"}
        anomalies={importState.stage === "RESOLVING_ANOMALIES" ? importState.anomalies : []}
        onCancel={() => {
          setImportState({ stage: "IDLE" });
          toast.info("Importação cancelada.");
        }}
        onConfirm={(resolutions: Record<string, Resolution>) => {
          if (importState.stage !== "RESOLVING_ANOMALIES") return;
          // Aplica resoluções em cópia imutável (applyResolutions já faz deep clone interno)
          const resolved = applyResolutions(importState.payload, importState.anomalies, resolutions);
          const cycleOn = !!(resolved as any)?.setup?.carbCycle;
          setImportState({
            stage: "PREVIEW",
            fileName: importState.fileName,
            payload: deepClone(resolved),
            cycleActivated: cycleOn || importState.cycleActivated,
            hadAnomalies: true,
            resolvedItems: Object.values(resolutions),
          });
        }}
      />
      <ProtocolImportPreview
        open={importState.stage === "PREVIEW" || importState.stage === "COMMITTING"}
        payload={importState.stage === "PREVIEW" || importState.stage === "COMMITTING" ? importState.payload : null}
        fileName={importState.stage === "PREVIEW" || importState.stage === "COMMITTING" ? importState.fileName : ""}
        hadAnomalies={importState.stage === "PREVIEW" || importState.stage === "COMMITTING" ? importState.hadAnomalies : false}
        onCancel={() => {
          setImportState({ stage: "IDLE" });
          toast.info("Importação cancelada.");
        }}
        onConfirm={() => {
          if (importState.stage !== "PREVIEW") return;
          const next: Extract<ImportState, { stage: "COMMITTING" }> = { ...importState, stage: "COMMITTING" };
          setImportState(next);
          void commit(next);
        }}
      />
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
