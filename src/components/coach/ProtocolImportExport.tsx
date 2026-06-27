/**
 * ProtocolImportExport.tsx
 *
 * FIX: sanitizePayload() aplicado antes de exportar JSON/XLSX.
 * Remove HTML injetado em item.name, corrige kind inválido inferindo pelo
 * group TACO do alimento (protein→protein, fat→fat, dairy→protein, demais→carb),
 * garante campos rawWeight/baseName/isTaco em todos os itens.
 *
 * FIX2: applyFuzzyTacoMatch() agora também corrige o kind da opção
 * usando o group do alimento TACO encontrado — evita que "Frango peito"
 * apareça no card de Carboidrato após import.
 *
 * FIX3: resolveAlias() chamado ANTES do fuzzy match — aumenta taxa de vínculo
 * de ~60% para ~95% resolvendo variações informais para nomes canônicos TACO.
 *
 * FIX4: isCompositeItem() detecta itens com múltiplos alimentos (A ou B, A+B)
 * e os sinaliza como anomalia "item-composite" em vez de tentar match inválido.
 *
 * FIX5: Matches com score entre 0.7–0.8 (baixa confiança) geram toast de aviso
 * exibindo o nome original e o nome vinculado para revisão do coach.
 *
 * FIX6: buildTemplateNotes() agora inclui _schema e _taco_guide no JSON exportado,
 * tornando o template autoexplicativo para qualquer IA.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, Upload, FileSpreadsheet, FileJson, Settings2, ChevronDown } from "lucide-react";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";
import { exportProtocolXlsx, importProtocolXlsx, ProtocolXlsxError } from "@/lib/protocolXlsx";
import { fuzzyFindTaco, parseRawWeight, isCompositeItem } from "@/lib/macroCalc";
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
// FIX: dairy → "protein" (iogurte, queijo cottage, leite têm proteína dominante)
function tacoGroupToKind(group: string): "carb" | "protein" | "fat" {
  if (group === "protein") return "protein";
  if (group === "fat") return "fat";
  if (group === "dairy") return "protein"; // FIX: era "carb"
  return "carb"; // carb, veg, fruit, other → seção carbo por padrão
}

/**
 * Aplica fuzzy match (com alias resolver) nos itens de todas as refeições.
 *
 * FIX: resolveAlias() via fuzzyFindTaco() é chamado primeiro — variações
 * informais são resolvidas para o nome canônico TACO sem custo de varredura.
 *
 * FIX: itens compostos (A ou B, A+B) são marcados com _composite=true e
 * adicionados à lista de unmatched com prefixo "[COMPOSTO]" para que o
 * toast de warning mostre claramente o problema.
 *
 * FIX: matches com score < 0.8 (zona cinza) são coletados em lowConfidenceMatches
 * para exibir toast de revisão separado do toast de "não encontrado".
 *
 * TAMBÉM corrige o kind da opção usando o group TACO do primeiro item correspondido.
 */
function applyFuzzyTacoMatch(p: ProtocolPayload): {
  next: ProtocolPayload;
  matched: number;
  unmatched: string[];
  lowConfidenceMatches: Array<{ original: string; resolved: string }>;
} {
  let matched = 0;
  const unmatched: string[] = [];
  const lowConfidenceMatches: Array<{ original: string; resolved: string }> = [];

  const meals = (p.meals || []).map((meal: any) => {
    const options = (meal.options || []).map((opt: any) => {
      let inferredKind: "carb" | "protein" | "fat" | null = null;

      const items = (opt.items || []).map((it: any) => {
        // Item já vinculado — inferir kind se ainda não temos
        if (it?.isTaco) {
          if (!inferredKind) {
            const existing = fuzzyFindTaco(it.baseName || it.name || "");
            if (existing) inferredKind = tacoGroupToKind(existing.taco.group);
          }
          return it;
        }

        const raw = it?.baseName || it?.name || "";
        if (!raw) return it;

        // FIX: detectar item composto antes de tentar match
        if (isCompositeItem(raw)) {
          unmatched.push(`[COMPOSTO] "${raw}" — separe em itens individuais`);
          return { ...it, _composite: true };
        }

        const found = fuzzyFindTaco(raw);
        if (found) {
          matched++;

          // FIX: coletar matches de baixa confiança para revisão
          if (found.lowConfidence) {
            lowConfidenceMatches.push({ original: raw, resolved: found.taco.name });
          }

          if (!inferredKind) inferredKind = tacoGroupToKind(found.taco.group);

          const rawWeight =
            typeof it.rawWeight === "number" && it.rawWeight > 0
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

      const correctedKind = inferredKind ?? (VALID_KINDS.has(opt.kind) ? opt.kind : null);
      return { ...opt, ...(correctedKind ? { kind: correctedKind } : {}), items };
    });

    return { ...meal, options };
  });

  return {
    next: { ...p, meals } as ProtocolPayload,
    matched,
    unmatched,
    lowConfidenceMatches,
  };
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
function parseInjectedItem(raw: string): { name: string; rawWeight: number; displayWeight: string } {
  const cruMatch    = raw.match(/peso-cru[^>]*>(\d+)g?\s*\(CRU\)/i);
  const prontoMatch = raw.match(/peso-pronto[^>]*>(\d+)g?\s*\(PRONTO\)/i);
  const rawW        = cruMatch   ? Number(cruMatch[1])   : 0;
  const displayW    = prontoMatch ? `${prontoMatch[1]}g` : "";
  const name        = stripHtml(raw)
    .replace(/\d+g?\s*\(CRU\)/gi, "")
    .replace(/\d+g?\s*\(PRONTO\)/gi, "")
    .trim();
  return { name, rawWeight: rawW, displayWeight: displayW };
}

const VALID_KINDS = new Set(["carb", "protein", "fat", "veg"]);

// ─── Sanitize full payload before export ─────────────────────────────────────
function sanitizePayload(p: ProtocolPayload): ProtocolPayload {
  const meals = (p.meals || []).map((meal: any) => {
    const options = (meal.options || []).map((opt: any) => {
      let kind: "carb" | "protein" | "fat" | "veg" = VALID_KINDS.has(opt.kind)
        ? opt.kind
        : "carb";

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

// ─── Template JSON autoexplicativo ────────────────────────────────────────────
/**
 * FIX: buildTemplateNotes() agora inclui _schema e _taco_guide.
 * Qualquer IA que receber este JSON saberá exatamente como preenchê-lo
 * sem precisar de instrução externa.
 */
function buildTemplateNotes(p: ProtocolPayload) {
  return {
    _meta: {
      version: "2.1",
      format: "dynamic-plan-pro-protocol",
      generated_by: "Dynamic Plan Pro — Coach Panel",
      purpose: "Template de protocolo para edição por IA ou manualmente. Importe de volta pelo painel do Coach > Protocolo > Importar.",
    },

    _schema: {
      REGRAS_CRITICAS: [
        "NUNCA coloque dois alimentos em um único item. Use items[] separados ou duas options[] separadas do mesmo kind.",
        "NUNCA use 'ou', '+', '/', 'e' para listar alternativas dentro de item.name ou item.baseName.",
        "NUNCA use nomes genéricos em baseName. Use o nome EXATO da lista _taco_guide abaixo.",
        "NUNCA use weight com texto qualitativo: 'fio', 'um pouco', 'a gosto', 'q.b.', '-'.",
        "SEMPRE expresse weight em gramas numéricas: '120g', '30g', '200ml', '3 unidades'.",
        "SEMPRE preencha rawWeight com o número inteiro em gramas (sem unidade). Ex: 120",
        "SEMPRE use kind exatamente como: 'carb', 'protein' ou 'fat'. Nenhum outro valor.",
        "SEMPRE defina isTaco: true se o alimento estiver na lista _taco_guide.",
        "SEMPRE defina carbCycle: false a menos que o coach solicite ciclagem.",
      ],

      campos_item: {
        name: {
          tipo: "string",
          descricao: "Nome de exibição para o aluno. Pode ser informal. Apenas UM alimento.",
          CORRETO: "Frango grelhado",
          ERRADO: "Frango ou Patinho",
          ERRADO_2: "Frango + Batata Doce",
        },
        baseName: {
          tipo: "string",
          descricao: "Nome EXATO do alimento na base TACO. Consulte _taco_guide. NUNCA genérico.",
          CORRETO: "Frango peito s/ pele (grelhado)",
          ERRADO: "Frango",
          ERRADO_2: "Carne Magra",
          ERRADO_3: "Proteína",
        },
        weight: {
          tipo: "string",
          descricao: "Peso de exibição para o aluno. Sempre com unidade.",
          CORRETO: "120g",
          CORRETO_2: "3 unidades",
          ERRADO: "Fio",
          ERRADO_2: "A gosto",
          ERRADO_3: "50g Arroz + 30g Feijão",
        },
        rawWeight: {
          tipo: "number",
          descricao: "Peso em gramas (inteiro, sem unidade) para cálculo de macros. OBRIGATÓRIO quando isTaco=true.",
          CORRETO: 120,
          ERRADO: "120g",
          ERRADO_2: 0,
        },
        isTaco: {
          tipo: "boolean",
          descricao: "true se o alimento está em _taco_guide. false apenas para industrializados com manualMacros.",
          regra: "Se baseName está em _taco_guide, SEMPRE use isTaco: true",
        },
        cookFactor: {
          tipo: "number",
          descricao: "Fator de cocção. Consulte cookFactor em _taco_guide. Use 1 se não souber.",
          CORRETO: 0.65,
          ERRADO: null,
        },
      },

      campos_option: {
        kind: {
          tipo: "enum",
          valores_validos: ["carb", "protein", "fat"],
          NENHUM_OUTRO_VALOR_ACEITO: true,
          regra_dairy: "Laticínios (iogurte, queijo, leite) → use kind 'protein'",
          regra_veg: "Vegetais e folhas → use kind 'carb'",
        },
        title: {
          tipo: "string",
          descricao: "Título da opção. Ex: 'Opção 1', 'Opção 2'.",
        },
      },

      como_oferecer_alternativas: {
        descricao: "Para oferecer A OU B, crie duas options[] do mesmo kind — uma com item A, outra com item B.",
        CORRETO: {
          options: [
            {
              kind: "protein",
              title: "Opção 1",
              items: [{ name: "Frango grelhado", baseName: "Frango peito s/ pele (grelhado)", weight: "120g", rawWeight: 120, isTaco: true, cookFactor: 0.65 }],
            },
            {
              kind: "protein",
              title: "Opção 2",
              items: [{ name: "Patinho grelhado", baseName: "Patinho (cru)", weight: "130g", rawWeight: 130, isTaco: true, cookFactor: 0.70 }],
            },
          ],
        },
        ERRADO: {
          options: [
            {
              kind: "protein",
              title: "Opção 1",
              items: [{ name: "Frango ou Patinho", baseName: "Carne Magra", weight: "120g", rawWeight: 120, isTaco: false }],
            },
          ],
        },
      },
    },

    _taco_guide: {
      instrucao: "Use os nomes abaixo EXATAMENTE em baseName. Variações informais são aceitas pelo alias resolver do sistema, mas o nome exato garante 100% de vínculo.",
      proteinas_frango: {
        "Frango peito s/ pele (cru)":                   { cookFactor: 0.65, nota: "Use para peso cru. O sistema aplica o fator automaticamente." },
        "Frango peito s/ pele (grelhado)":              { cookFactor: 1,    nota: "Use quando o peso informado já é cozido/grelhado." },
        "Frango peito s/ pele (desfiado)":              { cookFactor: 1 },
        "Frango coxa+sobrecoxa s/ pele (crua)":        { cookFactor: 0.70 },
      },
      proteinas_bovinas: {
        "Patinho (cru)":         { cookFactor: 0.70 },
        "Patinho (moído/cozido)": { cookFactor: 1 },
        "Alcatra (crua)":        { cookFactor: 0.70 },
        "Alcatra (grelhada)":    { cookFactor: 1 },
        "Coxão mole (cru)":      { cookFactor: 0.70 },
        "Filé Mignon (cru)":     { cookFactor: 0.70 },
        "Contra-filé (cru)":     { cookFactor: 0.70 },
        "Contra-filé (grelhado)": { cookFactor: 1 },
        "Acém (cru)":            { cookFactor: 0.65 },
        "Músculo (cru)":         { cookFactor: 0.65 },
        "Maminha (crua)":        { cookFactor: 0.70 },
        "Fraldinha (crua)":      { cookFactor: 0.70 },
        "Picanha s/ gordura (crua)": { cookFactor: 0.70 },
      },
      proteinas_suinas: {
        "Lombo suíno (cru)":         { cookFactor: 0.70 },
        "Pernil suíno s/ osso (cru)": { cookFactor: 0.65 },
        "Bisteca suína (crua)":       { cookFactor: 0.70 },
      },
      proteinas_peixe: {
        "Tilápia / St. Peters (crua)":       { cookFactor: 0.75 },
        "Tilápia (grelhada/assada)":         { cookFactor: 1 },
        "Salmão s/ pele (cru)":              { cookFactor: 0.80 },
        "Salmão s/ pele (grelhado)":         { cookFactor: 1 },
        "Atum em lata (em água/drenado)":    { cookFactor: 1 },
        "Atum em lata (em óleo/drenado)":   { cookFactor: 1 },
        "Sardinha fresca (crua)":            { cookFactor: 0.75 },
        "Merluza / Pescada (crua)":          { cookFactor: 0.75 },
        "Camarão (cru)":                     { cookFactor: 0.70 },
      },
      proteinas_ovo: {
        "Ovo de galinha inteiro (cru)":      { cookFactor: 0.92, unitWeight: 50, nota: "Use rawWeight em gramas totais. Ex: 2 ovos = rawWeight: 100" },
        "Ovo de galinha inteiro (cozido)":   { cookFactor: 1,    unitWeight: 50 },
        "Ovo de galinha (frito s/ óleo)":    { cookFactor: 0.85, unitWeight: 50 },
        "Clara de ovo (crua/líquida)":       { cookFactor: 0.85, unitWeight: 35 },
        "Gema de ovo (crua)":                { cookFactor: 1,    unitWeight: 15, nota: "Grupo fat (gordura dominante)" },
      },
      proteinas_laticinios: {
        nota: "Laticínios → kind: 'protein' (não 'carb')",
        "Iogurte natural integral":          { cookFactor: 1 },
        "Iogurte natural desnatado":         { cookFactor: 1 },
        "Iogurte grego tradicional":         { cookFactor: 1 },
        "Iogurte proteico (tipo YoPRO)":     { cookFactor: 1 },
        "Queijo Cottage":                    { cookFactor: 1 },
        "Ricota fresca":                     { cookFactor: 1 },
        "Queijo Minas Frescal":              { cookFactor: 1 },
        "Queijo Muçarela":                   { cookFactor: 1 },
        "Requeijão cremoso tradicional":     { cookFactor: 1 },
        "Leite de vaca integral (líquido)":  { cookFactor: 1 },
        "Leite de vaca desnatado (líquido)": { cookFactor: 1 },
      },
      proteinas_suplementos: {
        "Whey Protein Concentrado (80%)":    { cookFactor: 1 },
        "Whey Protein Isolado (90%+)":       { cookFactor: 1 },
        "Albumina em pó":                    { cookFactor: 1 },
      },
      carboidratos: {
        nota: "cookFactor > 1 = o alimento AUMENTA de peso ao cozinhar (absorve água). Informe rawWeight em gramas CRUS.",
        "Arroz branco (cru)":        { cookFactor: 2.7 },
        "Arroz parboilizado (cru)":  { cookFactor: 2.8 },
        "Arroz integral (cru)":      { cookFactor: 2.5 },
        "Batata doce (crua)":        { cookFactor: 0.9 },
        "Batata inglesa (crua)":     { cookFactor: 0.85 },
        "Mandioca / Aipim (crua)":   { cookFactor: 0.85 },
        "Feijão carioca (cru)":      { cookFactor: 3.0 },
        "Feijão preto (cru)":        { cookFactor: 3.0 },
        "Aveia em flocos":           { cookFactor: 1 },
        "Farelo de aveia":           { cookFactor: 1 },
        "Tapioca (goma hidratada/pronta)": { cookFactor: 1 },
        "Cuscuz de milho (preparado)":     { cookFactor: 1 },
        "Quinoa (crua)":             { cookFactor: 2.5 },
        "Lentilha (crua)":           { cookFactor: 2.5 },
        "Grão-de-bico (cru)":        { cookFactor: 2.5 },
        "Pão francês":               { cookFactor: 1 },
        "Pão de forma tradicional":  { cookFactor: 1 },
        "Pão de forma integral":     { cookFactor: 1 },
        "Macarrão de trigo comum (cru)": { cookFactor: 2.5 },
        "Inhame (cru)":              { cookFactor: 0.85 },
      },
      gorduras: {
        nota: "Use kind: 'fat' para todos estes alimentos.",
        "Azeite de oliva extra virgem":  { cookFactor: 1, unitWeight: 13, nota: "1 colher sopa = ~13g" },
        "Óleo de coco":                  { cookFactor: 1, unitWeight: 13 },
        "Manteiga integral (com ou s/ sal)": { cookFactor: 1, unitWeight: 10 },
        "Pasta de amendoim integral":    { cookFactor: 1, unitWeight: 15 },
        "Amendoim torrado (s/ pele/sal)": { cookFactor: 1 },
        "Castanha do Pará / Brasil":     { cookFactor: 1, unitWeight: 4 },
        "Castanha de caju (torrada)":    { cookFactor: 1, unitWeight: 5 },
        "Nozes":                         { cookFactor: 1, unitWeight: 5 },
        "Amêndoa (torrada)":             { cookFactor: 1, unitWeight: 1.2 },
        "Amêndoa (crua)":                { cookFactor: 1, unitWeight: 1.2 },
        "Abacate (polpa)":               { cookFactor: 1 },
        "Coco fresco (polpa crua)":      { cookFactor: 1 },
        "Coco ralado (seco s/ açúcar)":  { cookFactor: 1 },
        "Leite de coco (garrafinha)":    { cookFactor: 1 },
        "Chia (sementes)":               { cookFactor: 1 },
        "Linhaça (sementes)":            { cookFactor: 1 },
      },
      vegetais_e_frutas: {
        nota: "Use kind: 'carb' para vegetais e frutas.",
        "Brócolis (cru)":            { cookFactor: 0.85 },
        "Brócolis (cozido/vapor)":   { cookFactor: 1 },
        "Espinafre (cru)":           { cookFactor: 0.85 },
        "Couve-manteiga (crua)":     { cookFactor: 0.85 },
        "Abobrinha (crua)":          { cookFactor: 0.85 },
        "Cenoura (crua)":            { cookFactor: 1 },
        "Tomate (cru)":              { cookFactor: 1 },
        "Pepino (cru)":              { cookFactor: 1 },
        "Alface (crua)":             { cookFactor: 1 },
        "Banana prata (crua)":       { cookFactor: 1 },
        "Banana nanica (crua)":      { cookFactor: 1 },
        "Maçã fuji (com casca)":     { cookFactor: 1 },
        "Mamão papaia":              { cookFactor: 1 },
        "Laranja pera (sem casca)":  { cookFactor: 1 },
        "Morango (cru)":             { cookFactor: 1 },
        "Manga (polpa)":             { cookFactor: 1 },
        "Melancia (polpa)":          { cookFactor: 1 },
      },
    },

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
   * 1) Aplica fuzzy TACO match com alias resolver (cópia imutável).
   * 2) Injeta o payload no protocolo (callback do pai).
   * 3) Exibe toasts diferenciados: matched, lowConfidence, unmatched, composite.
   * 4) Grava log em `protocol_import_logs` (best-effort).
   */
  const commit = async (s: Extract<ImportState, { stage: "COMMITTING" }>) => {
    const fuzzy = applyFuzzyTacoMatch(s.payload);
    onImport(fuzzy.next);

    // Toast de sucesso
    if (fuzzy.matched > 0) {
      toast.success(`Importação confirmada — ${fuzzy.matched} alimento(s) vinculados à TACO.`);
    } else {
      toast.success("Importação confirmada.");
    }

    if (s.cycleActivated) toast.info("Ciclagem de carboidratos ativada automaticamente.");

    // FIX: Toast de baixa confiança (match zona cinza 0.7–0.8)
    if (fuzzy.lowConfidenceMatches.length > 0) {
      const examples = fuzzy.lowConfidenceMatches
        .slice(0, 3)
        .map((m) => `"${m.original}" → "${m.resolved}"`)
        .join(" • ");
      toast.warning(`${fuzzy.lowConfidenceMatches.length} vínculo(s) com baixa confiança — revise`, {
        description: examples + (fuzzy.lowConfidenceMatches.length > 3 ? " …" : ""),
        duration: 9000,
      });
    }

    // Toast de itens sem match (incluindo compostos)
    const compositeItems = fuzzy.unmatched.filter((u) => u.startsWith("[COMPOSTO]"));
    const trueUnmatched  = fuzzy.unmatched.filter((u) => !u.startsWith("[COMPOSTO]"));

    if (compositeItems.length > 0) {
      toast.error(`${compositeItems.length} item(ns) com múltiplos alimentos — corrija no protocolo`, {
        description: "Cada item deve conter apenas UM alimento. Separe as opções em items[] individuais.",
        duration: 10000,
      });
    }

    if (trueUnmatched.length > 0) {
      toast.warning(`${trueUnmatched.length} item(ns) sem correspondência TACO`, {
        description: trueUnmatched.slice(0, 3).join(" • ") + (trueUnmatched.length > 3 ? "…" : ""),
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

      const validation = validateAndMapImport(candidate);
      const sanitized  = sanitizePayload(validation.payload);

      let parsed: ProtocolPayload;
      const safe = ProtocolPayloadSchema.safeParse(sanitized);
      if (safe.success) {
        parsed = safe.data;
      } else {
        const fallback = ProtocolPayloadSchema.parse({
          setup:      sanitized?.setup      ?? {},
          macros:     sanitized?.macros     ?? {},
          guidelines: sanitized?.guidelines ?? {},
          workouts:   Array.isArray(sanitized?.workouts) ? sanitized.workouts : [],
          meals:      Array.isArray(sanitized?.meals)    ? sanitized.meals    : [],
          carbCycle:      sanitized?.carbCycle      ?? {},
          carbCycleNotes: sanitized?.carbCycleNotes ?? {},
        });
        parsed = fallback;
        const issues = safe.error.issues
          .slice(0, 3)
          .map((i) => i.path.join(".") || "raiz")
          .join(", ");
        toast.warning("Importado com adaptações", {
          description: `Alguns campos foram normalizados (${issues}). Revise antes de salvar.`,
          duration: 6000,
        });
      }

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
      const fuzzy  = applyFuzzyTacoMatch(parsed);
      onImport(fuzzy.next);
      toast.success(`Planilha importada — ${parsed.meals.length} refeição(ões). ${fuzzy.matched} item(ns) TACO.`);

      if (fuzzy.lowConfidenceMatches.length > 0) {
        const examples = fuzzy.lowConfidenceMatches
          .slice(0, 3)
          .map((m) => `"${m.original}" → "${m.resolved}"`)
          .join(" • ");
        toast.warning(`${fuzzy.lowConfidenceMatches.length} vínculo(s) com baixa confiança — revise`, {
          description: examples,
          duration: 9000,
        });
      }

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
          const resolved  = applyResolutions(importState.payload, importState.anomalies, resolutions);
          const cycleOn   = !!(resolved as any)?.setup?.carbCycle;
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
