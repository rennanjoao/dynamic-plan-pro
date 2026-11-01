/**
 * macroCalc.ts — cálculo puro de macros no client-side.
 *
 * Regras:
 *  - isTaco === true && rawWeight > 0 → busca TACO_FOODS por baseName e
 *    aplica (rawWeight / 100) × nutrientes. Sempre pelo peso CRU.
 *  - manualMacros existe → usa direto (não-TACO).
 *  - Caso contrário → contribuição zero.
 *
 * FIX: tacoGroupToKind agora mapeia dairy → "protein" (iogurte, queijo, leite
 *      têm proteína dominante na prescrição fitness).
 * FIX: resolveAlias() resolve ~100 variações comuns antes do fuzzy match,
 *      aumentando a taxa de vínculo TACO de ~60% para ~95%.
 * FIX: isCompositeItem() detecta itens com múltiplos alimentos (A ou B, A + B)
 *      para sinalizar anomalia no import em vez de tentar match inválido.
 */

import { TACO_FOODS, type TacoFood } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { INDUSTRIAL_FOODS, industrialByName, type IndustrialFood } from "@/data/industrialFoods";
import { LEGACY_TO_ENRICHED_FIBER, ZERO_FIBER_NAME_PATTERN } from "@/data/fiberEquivalents";

// ─── Dicionário de aliases ─────────────────────────────────────────────────────
// Mapeia variações informais → nome canônico TACO.
// Usado em resolveAlias() antes do fuzzy match para garantir vínculo exato.
// Sempre lowercase e sem acento (normalizados).
const TACO_ALIASES: Record<string, string> = {
  // Frango
  "frango grelhado":                         "Frango peito s/ pele (grelhado)",
  "frango peito grelhado":                   "Frango peito s/ pele (grelhado)",
  "peito de frango grelhado":                "Frango peito s/ pele (grelhado)",
  "peito grelhado":                          "Frango peito s/ pele (grelhado)",
  "file de frango grelhado":                 "Frango peito s/ pele (grelhado)",
  "file de frango":                          "Frango peito s/ pele (grelhado)",
  "peito de frango":                         "Frango peito s/ pele (grelhado)",
  "frango peito":                            "Frango peito s/ pele (grelhado)",
  "frango desfiado":                         "Frango peito s/ pele (desfiado)",
  "frango cozido":                           "Frango peito s/ pele (grelhado)",
  "frango assado":                           "Frango peito s/ pele (grelhado)",
  "frango cru":                              "Frango peito s/ pele (cru)",
  "peito de frango cru":                     "Frango peito s/ pele (cru)",
  "coxa sobrecoxa":                          "Frango coxa+sobrecoxa s/ pele (crua)",
  "coxa e sobrecoxa":                        "Frango coxa+sobrecoxa s/ pele (crua)",
  "coxa com sobrecoxa":                      "Frango coxa+sobrecoxa s/ pele (crua)",
  "coxa sobrecoxa sem pele":                 "Frango coxa+sobrecoxa s/ pele (crua)",
  // Bovinos
  "carne moida":                             "Patinho (cru)",
  "carne moida magra":                       "Patinho (cru)",
  "patinho moido":                           "Patinho (moído/cozido)",
  "carne magra":                             "Patinho (cru)",
  "carne vermelha magra":                    "Patinho (cru)",
  "bife":                                    "Alcatra (crua)",
  "bife grelhado":                           "Alcatra (grelhada)",
  "alcatra grelhada":                        "Alcatra (grelhada)",
  "coxao mole":                              "Coxão mole (cru)",
  "coxao duro":                              "Coxão duro (cru)",
  "file mignon":                             "Filé Mignon (cru)",
  "contrafile":                              "Contra-filé (cru)",
  "contra file":                             "Contra-filé (cru)",
  "contra file grelhado":                    "Contra-filé (grelhado)",
  "acem":                                    "Acém (cru)",
  "musculo":                                 "Músculo (cru)",
  "lagarto":                                 "Lagarto (cru)",
  "maminha":                                 "Maminha (crua)",
  "fraldinha":                               "Fraldinha (crua)",
  "picanha":                                 "Picanha s/ gordura (crua)",
  // Suínos
  "lombo":                                   "Lombo suíno (cru)",
  "lombo suino":                             "Lombo suíno (cru)",
  "pernil":                                  "Pernil suíno s/ osso (cru)",
  "bisteca":                                 "Bisteca suína (crua)",
  "bisteca suina":                           "Bisteca suína (crua)",
  // Peixes
  "tilapia":                                 "Tilápia / St. Peters (crua)",
  "tilapia grelhada":                        "Tilápia (grelhada/assada)",
  "salmao":                                  "Salmão s/ pele (cru)",
  "salmao grelhado":                         "Salmão s/ pele (grelhado)",
  "atum":                                    "Atum em lata (em água/drenado)",
  "atum lata":                               "Atum em lata (em água/drenado)",
  "atum em agua":                            "Atum em lata (em água/drenado)",
  "atum em oleo":                            "Atum em lata (em óleo/drenado)",
  "sardinha":                                "Sardinha fresca (crua)",
  "merluza":                                 "Merluza / Pescada (crua)",
  "camarao":                                 "Camarão (cru)",
  // Ovos
  "ovo":                                     "Ovo de galinha inteiro (cru)",
  "ovos":                                    "Ovo de galinha inteiro (cru)",
  "ovo inteiro":                             "Ovo de galinha inteiro (cru)",
  "ovos inteiros":                           "Ovo de galinha inteiro (cru)",
  "ovo cozido":                              "Ovo de galinha inteiro (cozido)",
  "ovo frito":                               "Ovo de galinha (frito s/ óleo)",
  "clara":                                   "Clara de ovo (crua/líquida)",
  "claras":                                  "Clara de ovo (crua/líquida)",
  "clara de ovo":                            "Clara de ovo (crua/líquida)",
  "gema":                                    "Gema de ovo (crua)",
  // Carboidratos
  "arroz":                                   "Arroz branco (cru)",
  "arroz branco":                            "Arroz branco (cru)",
  "arroz parboilizado":                      "Arroz parboilizado (cru)",
  "arroz integral":                          "Arroz integral (cru)",
  "batata doce":                             "Batata doce (crua)",
  "batata inglesa":                          "Batata inglesa (crua)",
  "batata":                                  "Batata inglesa (crua)",
  "mandioca":                                "Mandioca / Aipim (crua)",
  "aipim":                                   "Mandioca / Aipim (crua)",
  "macaxeira":                               "Mandioca / Aipim (crua)",
  "feijao":                                  "Feijão carioca (cru)",
  "feijao carioca":                          "Feijão carioca (cru)",
  "feijao preto":                            "Feijão preto (cru)",
  "aveia":                                   "Aveia em flocos",
  "aveia em flocos":                         "Aveia em flocos",
  "farelo de aveia":                         "Farelo de aveia",
  "tapioca":                                 "Tapioca (goma hidratada/pronta)",
  "cuscuz":                                  "Cuscuz de milho (preparado)",
  "quinoa":                                  "Quinoa (crua)",
  "lentilha":                                "Lentilha (crua)",
  "grao de bico":                            "Grão-de-bico (cru)",
  "pao frances":                             "Pão francês",
  "pao de forma":                            "Pão de forma tradicional",
  "pao integral":                            "Pão de forma integral",
  "macarrao":                                "Macarrão de trigo comum (cru)",
  "inhame":                                  "Inhame (cru)",
  // Gorduras
  "azeite":                                  "Azeite de oliva extra virgem",
  "azeite extra virgem":                     "Azeite de oliva extra virgem",
  "azeite de oliva":                         "Azeite de oliva extra virgem",
  "oleo de coco":                            "Óleo de coco",
  "manteiga":                                "Manteiga integral (com ou s/ sal)",
  "pasta de amendoim":                       "Pasta de amendoim integral",
  "amendoim":                                "Amendoim torrado (s/ pele/sal)",
  "castanha do para":                        "Castanha do Pará / Brasil",
  "castanha do brasil":                      "Castanha do Pará / Brasil",
  "castanha de caju":                        "Castanha de caju (torrada)",
  "castanha":                                "Castanha do Pará / Brasil",
  "nozes":                                   "Nozes",
  "amendoa":                                 "Amêndoa (torrada)",
  "abacate":                                 "Abacate (polpa)",
  "coco fresco":                             "Coco fresco (polpa crua)",
  "coco":                                    "Coco fresco (polpa crua)",
  "chia":                                    "Chia (sementes)",
  "linhaca":                                 "Linhaça (sementes)",
  // Laticínios (mapeados para protein pois têm proteína dominante)
  "iogurte":                                 "Iogurte natural integral",
  "iogurte natural":                         "Iogurte natural integral",
  "iogurte desnatado":                       "Iogurte natural desnatado",
  "iogurte grego":                           "Iogurte grego tradicional",
  "iogurte proteico":                        "Iogurte proteico (tipo YoPRO)",
  "queijo cottage":                          "Queijo Cottage",
  "cottage":                                 "Queijo Cottage",
  "ricota":                                  "Ricota fresca",
  "queijo minas":                            "Queijo Minas Frescal",
  "queijo mussarela":                        "Queijo Muçarela",
  "mussarela":                               "Queijo Muçarela",
  "requeijao":                               "Requeijão cremoso tradicional",
  "leite":                                   "Leite de vaca integral (líquido)",
  "leite desnatado":                         "Leite de vaca desnatado (líquido)",
  "leite integral":                          "Leite de vaca integral (líquido)",
  // Suplementos
  "whey":                                    "Whey Protein Concentrado (80%)",
  "whey protein":                            "Whey Protein Concentrado (80%)",
  "whey concentrado":                        "Whey Protein Concentrado (80%)",
  "whey isolado":                            "Whey Protein Isolado (90%+)",
  "albumina":                                "Albumina em pó",
  // Vegetais
  "brocolis":                                "Brócolis (cozido/vapor)",
  "espinafre":                               "Espinafre (cru)",
  "couve":                                   "Couve-manteiga (crua)",
  "abobrinha":                               "Abobrinha (crua)",
  "cenoura":                                 "Cenoura (crua)",
  "tomate":                                  "Tomate (cru)",
  "pepino":                                  "Pepino (cru)",
  "alface":                                  "Alface (crua)",
  // Frutas
  "banana":                                  "Banana prata (crua)",
  "banana nanica":                           "Banana nanica (crua)",
  "maca":                                    "Maçã fuji (com casca)",
  "mamao":                                   "Mamão papaia",
  "laranja":                                 "Laranja pera (sem casca)",
  "morango":                                 "Morango (cru)",
  "uva":                                     "Uva Itália (com casca)",
  "manga":                                   "Manga (polpa)",
  "melancia":                                "Melancia (polpa)",
};

/** Normaliza string para lookup de alias: remove acentos, lowercase, sem pontuação. */
function normalizeForAlias(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tenta resolver um nome informal para o nome canônico TACO via dicionário de aliases.
 * Retorna o nome canônico se encontrar, ou null.
 *
 * Estratégia em dois passos:
 *  1. Match exato normalizado (mais rápido e preciso).
 *  2. Match parcial: verifica se a query está contida num alias ou vice-versa
 *     (para capturar "Frango peito s/ pele" a partir de "frango peito grelhado").
 */
export function resolveAlias(rawName: string): string | null {
  if (!rawName) return null;
  const q = normalizeForAlias(rawName);
  if (!q) return null;

  // 1. Exato
  if (TACO_ALIASES[q]) return TACO_ALIASES[q];

  // 2. Parcial: a query contém o alias ou o alias contém a query
  for (const [alias, canonical] of Object.entries(TACO_ALIASES)) {
    if (q.includes(alias) || alias.includes(q)) {
      return canonical;
    }
  }

  return null;
}

/**
 * Detecta se um nome de item contém múltiplos alimentos — padrão proibido no template.
 * Exemplos: "Frango ou Patinho", "Arroz + Feijão", "Salmão/Contra-filé".
 * Nesses casos, o fuzzy match vai falhar ou vincular errado.
 */
export function isCompositeItem(name: string): boolean {
  if (!name) return false;
  return /\b(ou|and|e)\b|\+|\//i.test(name);
}

// ─── tacoGroupToKind ───────────────────────────────────────────────────────────
/**
 * Mapeia o `group` da TACO para o `kind` de card (carb | protein | fat).
 *
 * FIX: dairy → "protein"
 * Laticínios (iogurte, queijo, leite) têm proteína como macronutriente
 * predominante na prescrição fitness. Antes mapeava para "carb", causando
 * iogurte grego e queijo cottage aparecerem no card de carboidrato.
 *
 * veg, fruit, other → "carb" (vegetais e frutas ficam na seção de carbo/vegetal)
 */
export function tacoGroupToKind(group: TacoFood["group"]): "carb" | "protein" | "fat" {
  if (group === "protein") return "protein";
  if (group === "fat") return "fat";
  if (group === "dairy") return "protein"; // FIX: era "carb"
  return "carb"; // carb, veg, fruit, other
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /**
   * Quantidade de itens (com peso válido) cuja fibra NÃO está cadastrada na base.
   * Fibra = 0 com `fiberUnknown > 0` significa "sem dado", não "zero fibra".
   */
  fiberUnknown?: number;
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, fiberUnknown: 0 };

function tacoByName(name: string): TacoFood | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return ENRICHED_FOODS.find((t) => t.name.toLowerCase() === n) || TACO_FOODS.find((t) => t.name.toLowerCase() === n);
}

/**
 * Lookup unificado: TACO primeiro, depois industrializados.
 * Retorna o registro nutricional (g/100g) para qualquer alimento conhecido.
 */
function foodByName(name: string): TacoFood | IndustrialFood | undefined {
  return tacoByName(name) || industrialByName(name);
}

/**
 * Parser numérico seguro para a string de quantidade do alimento.
 * Extrai o valor numérico e detecta se é unidade (un, unidade, fatia, ovo)
 * ou peso em gramas/ml.
 *
 * Retorna a quantidade original e a conversão quando ela é segura. Unidades
 * sem peso cadastrado nunca recebem um peso inventado.
 *
 * Exemplos:
 *   "150g"        → { value:150, grams:150,  isUnit:false }
 *   "1,5 kg"      → { value:1.5, grams:1500, isUnit:false }
 *   "8 unidades"  → conversão somente quando o alimento possui peso unitário cadastrado
 *   "2 fatias"    → { value:2,   grams:100,  isUnit:true  }
 *   ""            → { value:0,   grams:0,    isUnit:false }
 */
function normTxt(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Lê quantidade inicial: "100", "7,5", "1/2", "1 1/2", "meia", "uma". */
function readQuantity(t: string): { qty: number; rest: string } {
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/);
  if (m) return { qty: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: m[4] };
  m = t.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (m) return { qty: Number(m[1]) / Number(m[2]), rest: m[3] };
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (m) return { qty: parseFloat(m[1].replace(",", ".")), rest: m[2] };
  m = t.match(/^(meia|meio)\s+(.*)$/);
  if (m) return { qty: 0.5, rest: m[2] };
  m = t.match(/^(uma|um)\s+(.*)$/);
  if (m) return { qty: 1, rest: m[2] };
  return { qty: 0, rest: t };
}

/** Resultado da leitura do texto de quantidade. Campos extras (`status`, `label`, `hint`, `canonicalText`) alimentam o feedback ao vivo na tela. */
export interface ParsedQuantity {
  value: number;
  grams: number;
  isUnit: boolean;
  unit: "g" | "ml" | "kg" | "l" | "unit" | "unknown";
  original: string;
  convertible: boolean;
  /** ok = entendi e converti · no-weight = entendi a medida, mas não há peso cadastrado · unknown = não entendi · empty = vazio */
  status?: "ok" | "no-weight" | "unknown" | "empty";
  /** Medida reconhecida, já completa (ex.: "colher de sopa") — mostra o que o sistema entendeu. */
  label?: string;
  /** Mensagem curta para o coach quando status !== "ok". */
  hint?: string;
  /**
   * Texto padronizado de uma medida caseira reconhecida (ex.: "2 uni" → "2 unidades").
   * É o que deve ficar gravado, porque a visão do aluno exibe o texto digitado pelo coach.
   */
  canonicalText?: string;
}

type UnitKind = "g" | "kg" | "ml" | "l" | "measure";
interface UnitCanon { kind: UnitKind; canon: string; qual?: string }

// Medidas caseiras reconhecidas (forma canônica, singular, sem acento).
const MEASURE_CANON = [
  "unidade", "fatia", "ovo", "clara", "colher", "copo", "porcao", "scoop", "dosador",
  "lata", "pote", "xicara", "pedaco", "file", "bife", "castanha",
];
// Abreviações curtas que não seguem a regra de prefixo.
const SHORT_ALIASES: Record<string, UnitCanon> = {
  un: { kind: "measure", canon: "unidade" }, und: { kind: "measure", canon: "unidade" },
  unid: { kind: "measure", canon: "unidade" }, uni: { kind: "measure", canon: "unidade" },
  cs: { kind: "measure", canon: "colher", qual: "sopa" }, cc: { kind: "measure", canon: "colher", qual: "cha" },
  col: { kind: "measure", canon: "colher" }, colh: { kind: "measure", canon: "colher" },
  cp: { kind: "measure", canon: "copo" },
};

/** Formas singulares possíveis de uma palavra no plural (colheres → colher, porcoes → porcao, files → file). */
function singularForms(w: string): string[] {
  const out = [w];
  if (w.endsWith("oes") && w.length > 4) out.push(w.slice(0, -3) + "ao");
  if (w.endsWith("ais") && w.length > 4) out.push(w.slice(0, -3) + "al");
  if (w.endsWith("es") && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith("s") && w.length > 3) out.push(w.slice(0, -1));
  return out;
}

/** Chave genérica de uma palavra de medida (para medidas cadastradas fora da lista fixa, ex.: "concha"). */
function genericKey(w: string): string {
  const t = w.replace(/[^a-z]/g, "");
  return t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t;
}

/** Reconhece o que foi digitado (mesmo incompleto: "uni", "colh", "coelh", "fat") como unidade/medida. */
function canonUnit(rawTok: string): UnitCanon | null {
  let tok = rawTok.replace(/[^a-z]/g, "");
  if (!tok) return null;
  tok = tok.replace(/^coe?lh/, "colh"); // "coelher"/"coelh" (erro comum) → colher
  if (/^(g|gr|grs|gra|gram|grama|gramas)$/.test(tok)) return { kind: "g", canon: "g" };
  if (/^(kg|kgs|kilo|kilos|quilo|quilos)$/.test(tok) || (tok.length >= 3 && ("quilos".startsWith(tok) || "kilos".startsWith(tok)))) return { kind: "kg", canon: "kg" };
  if (/^(ml|mls)$/.test(tok) || (tok.length >= 4 && "mililitros".startsWith(tok))) return { kind: "ml", canon: "ml" };
  if (/^(l|lt|lts)$/.test(tok) || (tok.length >= 3 && "litros".startsWith(tok))) return { kind: "l", canon: "l" };
  if (SHORT_ALIASES[tok]) return SHORT_ALIASES[tok];
  const forms = singularForms(tok);
  for (const c of MEASURE_CANON) {
    if (forms.includes(c)) return { kind: "measure", canon: c };
  }
  if (tok.length >= 3) {
    for (const c of MEASURE_CANON) {
      if (forms.some((f) => c.startsWith(f))) return { kind: "measure", canon: c };
    }
  }
  return null;
}

/** Qualificador de colher: "sopa" | "cha" | "sobremesa" | "cafe" (aceita parcial e pontuação: "sop", "(sopa)"). */
function canonQualifier(words: string[]): string | null {
  for (const raw of words) {
    const w = raw.replace(/[^a-z]/g, "");
    if (/^so?p/.test(w)) return "sopa";
    if (w === "cha" || w === "ch") return "cha";
    if (/^sobr/.test(w)) return "sobremesa";
    if (/^caf/.test(w)) return "cafe";
  }
  return null;
}

const DISPLAY_NAME: Record<string, [string, string]> = {
  unidade: ["unidade", "unidades"], fatia: ["fatia", "fatias"], ovo: ["ovo", "ovos"], clara: ["clara", "claras"],
  colher: ["colher", "colheres"], copo: ["copo", "copos"], porcao: ["porção", "porções"], scoop: ["scoop", "scoops"],
  dosador: ["dosador", "dosadores"], lata: ["lata", "latas"], pote: ["pote", "potes"], xicara: ["xícara", "xícaras"],
  pedaco: ["pedaço", "pedaços"], file: ["filé", "filés"], bife: ["bife", "bifes"], castanha: ["castanha", "castanhas"],
};
const QUAL_DISPLAY: Record<string, string> = { sopa: "de sopa", cha: "de chá", sobremesa: "de sobremesa", cafe: "de café" };

function measureLabel(canon: string, qual: string | null, plural = false): string {
  const names = DISPLAY_NAME[canon];
  const n = names ? names[plural ? 1 : 0] : canon;
  return `${n}${qual ? " " + QUAL_DISPLAY[qual] : ""}`;
}

/**
 * Converte o texto digitado na prescrição em gramas — tolerante a digitação INCOMPLETA.
 * Aceita "100g", "100 g", "100G", "100 gramas", "1,5 kg", "250 ml", "1 l" e medidas caseiras
 * ("1 lata", "2 fatias", "1 scoop", "1 colher de sopa"), inclusive abreviadas ou em andamento:
 * "2 uni", "1 colh", "1 coelh", "3 fat", "2 cs".
 * Medidas caseiras só convertem quando há peso cadastrado (porção ou unitWeight);
 * nunca inventa peso.
 */
export function parseWeightString(
  raw: unknown,
  unitWeight?: number,
  portions?: Array<{ label: string; grams: number }>,
): ParsedQuantity {
  const text = String(raw ?? "").trim();
  const base = (over: Partial<ParsedQuantity>): ParsedQuantity => ({
    value: 0, grams: 0, isUnit: false, unit: "unknown", original: text, convertible: false, ...over,
  });
  if (!text) return base({ status: "empty" });

  const t = normTxt(text);
  const { qty, rest: rest0 } = readQuantity(t);
  const numberText = t.slice(0, t.length - rest0.length).trim(); // "2", "1,5", "1/2", "meia"…
  const rest = rest0.replace(/[.]+$/, "").trim();
  if (!(qty > 0)) return base({ status: "unknown", hint: "Comece pelo número (ex.: 100g, 2 fatias)." });
  const ok = (grams: number, unit: ParsedQuantity["unit"], isUnit = false, label?: string, canonicalText?: string): ParsedQuantity =>
    ({ value: qty, grams, isUnit, unit, original: text, convertible: grams > 0, status: grams > 0 ? "ok" : "no-weight", label, canonicalText });

  if (!rest) return ok(qty, "g");

  const words = rest.split(" ").filter((w) => w && w !== "de" && w !== "da" && w !== "do" && w !== "d");
  const unit = canonUnit(words[0] ?? "");

  if (unit && unit.kind === "g") return ok(qty, "g");
  if (unit && unit.kind === "kg") return ok(qty * 1000, "kg");
  if (unit && unit.kind === "ml") return ok(qty, "ml");
  if (unit && unit.kind === "l") return ok(qty * 1000, "l");

  // ── Medida caseira ──
  const qual = unit && unit.canon === "colher" ? (unit.qual ?? canonQualifier(words.slice(1))) : null;
  const plural = qty > 1;
  const label = unit ? measureLabel(unit.canon, qual) : words[0] ?? rest;
  const canonicalFor = (canon: string, q: string | null) => `${numberText} ${measureLabel(canon, q, plural)}`;
  const noWeight = (extra?: string): ParsedQuantity => ({
    value: qty, grams: 0, isUnit: true, unit: "unit", original: text, convertible: false,
    status: "no-weight", label,
    hint: extra ?? `"${label}" não tem peso cadastrado para este alimento — digite em gramas.`,
  });

  // 1) Medidas caseiras cadastradas para o alimento (ex.: "1 lata drenada" = 120 g).
  //    Aceita também palavras fora da lista fixa (ex.: "concha"), como o parser anterior aceitava.
  if (portions && portions.length) {
    const userKey = unit ? unit.canon : genericKey(words[0] ?? "");
    const cands: Array<{ p: { label: string; grams: number }; per: number; q: string | null; canon: string | null }> = [];
    for (const p of portions) {
      const { qty: pq, rest: pr } = readQuantity(normTxt(p.label));
      const pw = (pr || "").split(" ").filter((w) => w && w !== "de" && w !== "da" && w !== "do");
      const pu = canonUnit(pw[0] ?? "");
      const pKey = pu && pu.kind === "measure" ? pu.canon : genericKey(pw[0] ?? "");
      const matches = pKey === userKey || (!unit && userKey.length >= 3 && pKey.startsWith(userKey));
      if (matches && pKey) {
        cands.push({
          p, per: p.grams / (pq > 0 ? pq : 1),
          q: pu && pu.canon === "colher" ? (pu.qual ?? canonQualifier(pw.slice(1))) : null,
          canon: pu && pu.kind === "measure" ? pu.canon : null,
        });
      }
    }
    const pick = qual ? cands.find((c) => c.q === qual) : (cands.find((c) => c.p.grams > 0 && Math.abs(c.per - c.p.grams) < 1e-9) ?? cands[0]);
    if (pick) {
      const pickQ = pick.q ?? qual;
      if (pick.canon) return ok(qty * pick.per, "unit", true, measureLabel(pick.canon, pickQ), canonicalFor(pick.canon, pickQ));
      return ok(qty * pick.per, "unit", true, words[0]);
    }
  }

  if (!unit) return base({ value: qty, status: "unknown", hint: `Não entendi "${rest}". Use g, kg, ml ou uma medida (unidade, fatia, colher…).` });

  // 2) Peso unitário médio cadastrado. Colher "de chá/sobremesa/café" nunca herda peso de colher de sopa.
  if (unit.canon === "colher" && qual && qual !== "sopa") return noWeight();
  if (typeof unitWeight === "number" && unitWeight > 0) return ok(qty * unitWeight, "unit", true, label, canonicalFor(unit.canon, qual));
  return noWeight();
}

/**
 * Lê o texto de quantidade de um item já vinculado a um alimento (TACO ou industrializado),
 * usando o peso unitário e as medidas caseiras DESTE alimento. Fonte única usada pela tela
 * (feedback ao vivo + rawWeight) para não duplicar a regra em cada componente.
 */
export function resolveQuantity(item: any, text: string): ParsedQuantity {
  const food: any = foodByName(String(item?.baseName || item?.name || ""));
  const unitW = typeof food?.unitWeight === "number" ? food.unitWeight : undefined;
  return parseWeightString(text, unitW, food?.portions);
}

/** Medidas caseiras que o alimento aceita (para o texto de ajuda quando o campo está vazio). */
export function quantityHintsFor(item: any): string[] {
  const food: any = foodByName(String(item?.baseName || item?.name || ""));
  if (!food) return [];
  const out: string[] = [];
  if (Array.isArray(food.portions)) food.portions.forEach((p: any) => out.push(`${p.label} = ${p.grams} g`));
  else if (typeof food.unitWeight === "number") out.push(`1 unidade = ${food.unitWeight} g`);
  return out.slice(0, 3);
}

// ─── Fibra ─────────────────────────────────────────────────────────────────────
export type FiberSource = "table" | "equivalent" | "zero" | "missing";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Fibra (g/100 g) de um alimento, com a origem do dado.
 *  1. `fiber` cadastrado no próprio alimento (prioridade);
 *  2. equivalente exato (mesmo alimento, mesmo estado) na base TACO enriquecida;
 *  3. zero nutricional (carnes, ovos, laticínios, óleos);
 *  4. "missing": sem dado — NUNCA tratado como zero silencioso.
 */
export function resolveFiberPer100(food: any): { value: number; source: FiberSource } {
  if (!food) return { value: 0, source: "missing" };
  const own = Number(food.fiber);
  if (food.fiber != null && Number.isFinite(own) && own >= 0) return { value: own, source: "table" };

  const key = String(food.name || "").trim().toLowerCase();
  const eqName = LEGACY_TO_ENRICHED_FIBER[key];
  if (eqName) {
    const eq = ENRICHED_FOODS.find((f) => f.name === eqName);
    if (eq && Number.isFinite(eq.fiber)) return { value: eq.fiber, source: "equivalent" };
  }

  const n = stripAccents(String(food.name || ""));
  const group = food.group as string | undefined;
  const animalOrOilGroup = group === "protein" || group === "dairy" || group === "fat";
  if (animalOrOilGroup && ZERO_FIBER_NAME_PATTERN.test(n) && !/soja|amendoim|castanha|coco ralado/.test(n)) {
    return { value: 0, source: "zero" };
  }
  return { value: 0, source: "missing" };
}

/** Peso (g) de um item de alimento, usando rawWeight ou o texto digitado + medidas caseiras do alimento. */
function itemGrams(item: any, food: any): number {
  if (typeof item.rawWeight === "number" && item.rawWeight > 0) return item.rawWeight;
  if (item.weight != null) {
    const unitW = typeof food?.unitWeight === "number" ? food.unitWeight : undefined;
    return parseWeightString(item.weight, unitW, food?.portions).grams;
  }
  return 0;
}

export function calcItemMacros(item: any): Macros {
  if (!item) return { ...ZERO };
  // Itens marcados como opcional não entram no cálculo
  if (item.optional === true) return { ...ZERO };
  // isTaco === true cobre TACO + industrializados (ambos têm tabela conhecida g/100g).
  // isIndustrial === true também aceito para clareza.
  if (item.isTaco === true || item.isIndustrial === true) {
    const food = foodByName(item.baseName || item.name);
    if (!food) return { ...ZERO };

    // Prioriza rawWeight numérico já gravado; senão, parseia o texto (com medidas caseiras do alimento).
    const grams = itemGrams(item, food);
    if (!grams || !isFinite(grams) || grams <= 0) return { ...ZERO };
    const f = grams / 100;
    const fib = resolveFiberPer100(food);
    return {
      kcal: food.kcal * f,
      protein: food.p * f,
      carbs: food.c * f,
      fat: food.g * f,
      fiber: fib.source === "missing" ? 0 : fib.value * f,
      fiberUnknown: fib.source === "missing" ? 1 : 0,
    };
  }
  if (item.manualMacros) {
    const m = item.manualMacros;
    const protein = Number(m.protein) || 0;
    const carbs = Number(m.carbs) || 0;
    const fat = Number(m.fat) || 0;
    const kcal = Number(m.kcal) || protein * 4 + carbs * 4 + fat * 9;
    const hasFiber = m.fiber != null && Number.isFinite(Number(m.fiber));
    return {
      kcal,
      protein,
      carbs,
      fat,
      fiber: hasFiber ? Math.max(0, Number(m.fiber)) : 0,
      fiberUnknown: hasFiber || kcal <= 0 ? 0 : 1,
    };
  }
  return { ...ZERO };
}

/**
 * Calcula macros de UMA refeição.
 *
 * Soma os macros de TODOS os itens da primeira opção de cada kind.
 * O kind de cada item é determinado pelo group TACO do alimento (não pelo
 * kind declarado na opção), evitando que "Frango peito" colocado
 * erroneamente na seção Carbo distorça os totais.
 *
 * Para o placar do dia, o que importa é o valor nutricional real do item,
 * independentemente de em qual card o coach o posicionou.
 */
export function calcMealMacros(meal: any): Macros {
  if (!meal) return { ...ZERO };
  const out: Macros = { ...ZERO };
  const opts: any[] = Array.isArray(meal.options) ? meal.options : [];

  // Pega a primeira opção de cada kind para não somar alternativas (Op1 + Op2)
  const seenKind: Record<string, boolean> = {};
  opts.forEach((opt) => {
    const kind = opt?.kind || "other";
    if (seenKind[kind]) return;
    seenKind[kind] = true;
    const items: any[] = Array.isArray(opt?.items) ? opt.items : [];
    items.forEach((it) => {
      const m = calcItemMacros(it);
      out.kcal    += m.kcal;
      out.protein += m.protein;
      out.carbs   += m.carbs;
      out.fat     += m.fat;
      out.fiber   += m.fiber || 0;
      out.fiberUnknown = (out.fiberUnknown || 0) + (m.fiberUnknown || 0);
    });
  });
  return out;
}

export function calcDayMacros(meals: any[]): Macros {
  if (!Array.isArray(meals)) return { ...ZERO };
  const out: Macros = { ...ZERO };
  meals.forEach((m) => {
    const r = calcMealMacros(m);
    out.kcal += r.kcal;
    out.protein += r.protein;
    out.carbs += r.carbs;
    out.fat += r.fat;
    out.fiber += r.fiber || 0;
    out.fiberUnknown = (out.fiberUnknown || 0) + (r.fiberUnknown || 0);
  });
  return out;
}

/**
 * Macros de UMA opção (principal ou substituição).
 * Soma todos os items da opção; usado para comparar opções entre si.
 */
export function optionMacros(option: any): Macros {
  if (!option) return { ...ZERO };
  const items: any[] = Array.isArray(option.items) ? option.items : [];
  const out: Macros = { ...ZERO };
  items.forEach((it) => {
    const m = calcItemMacros(it);
    out.kcal    += m.kcal;
    out.protein += m.protein;
    out.carbs   += m.carbs;
    out.fat     += m.fat;
    out.fiber   += m.fiber || 0;
    out.fiberUnknown = (out.fiberUnknown || 0) + (m.fiberUnknown || 0);
  });
  return out;
}

// ─── Ajuste proporcional de gramagem (Op 2/3 conforme Op 1) ────────────────────

export type OptionKind = "carb" | "protein" | "fat";

/** Macro (do objeto Macros) que representa o papel nutricional de um `kind` de opção. */
export function primaryMacroKeyForKind(kind: OptionKind): "protein" | "carbs" | "fat" {
  return kind === "carb" ? "carbs" : kind === "protein" ? "protein" : "fat";
}

/**
 * Macros por GRAMA (cru) de um item — só existe para itens vinculados a um
 * alimento conhecido (TACO ou industrializado). Itens com `manualMacros`
 * guardam um total fixo (não escalam com peso) e itens sem vínculo não têm
 * base nutricional nenhuma, então ambos retornam null aqui.
 */
export function itemMacrosPerGram(item: any): Macros | null {
  if (!item) return null;
  if (item.isTaco === true || item.isIndustrial === true) {
    const food = foodByName(item.baseName || item.name);
    if (!food) return null;
    return {
      kcal: food.kcal / 100,
      protein: food.p / 100,
      carbs: food.c / 100,
      fat: food.g / 100,
      fiber: resolveFiberPer100(food).value / 100,
    };
  }
  return null;
}

export interface ProportionalWeightItem {
  index: number;
  grams: number;
  resolved: boolean;
}

export interface ProportionalWeightResult {
  ok: boolean;
  reason?: string;
  items: ProportionalWeightItem[];
  targetMacro: number;
  targetKcal: number;
}

/**
 * Sugere o peso cru de cada item de `targetOption` para que o total dessa
 * opção bata o total da Opção 1 (`refOption`) da mesma refeição — reaproveitando
 * a PROPORÇÃO de peso entre os itens da Opção 1.
 *
 * Exemplo: Opção 1 = Arroz 120g + Feijão 80g (60%/40%). Se a Opção 2 tiver
 * Mandioca + Brócolis (sem peso definido ainda), o Brócolis herda a "fatia"
 * de 40% e a Mandioca a de 60% — e a escala geral é resolvida para que a
 * soma do macro do `kind` (carbo/proteína/gordura) bata o total da Opção 1.
 *
 * Regras de mapeamento quando a quantidade de itens difere entre as opções:
 *  - menos itens no alvo → o(s) excedente(s) da referência é somado no
 *    último item do alvo;
 *  - mais itens no alvo → repete a última proporção da referência para os
 *    itens extras;
 *  - depois disso, normaliza para somar 100%.
 * Itens marcados como "opcional" (flag `optional`, o mesmo "Opcional?" que já
 * some do cálculo de kcal em calcItemMacros) ficam de fora dos dois lados:
 * não entram na proporção de referência da Opção 1, nem recebem peso sugerido
 * no alvo — exatamente como já não entram no total de kcal/macro hoje.
 * Itens do alvo sem alimento reconhecido também ficam de fora (peso não
 * sugerido) e o restante é renormalizado só entre os itens elegíveis.
 */
export function suggestProportionalWeights(
  refOption: any,
  targetOption: any,
  kind: OptionKind,
): ProportionalWeightResult {
  const macroKey = primaryMacroKeyForKind(kind);
  const refItems: any[] = Array.isArray(refOption?.items) ? refOption.items : [];
  const tgtItems: any[] = Array.isArray(targetOption?.items) ? targetOption.items : [];

  // Proporção de referência: só itens NÃO-opcionais e reconhecidos com peso > 0.
  const refContribWeights: number[] = [];
  refItems.forEach((it) => {
    if (it?.optional === true) return;
    const perGram = itemMacrosPerGram(it);
    const grams = typeof it?.rawWeight === "number" ? it.rawWeight : 0;
    if (perGram && grams > 0) refContribWeights.push(grams);
  });
  const refTotalWeight = refContribWeights.reduce((a, b) => a + b, 0);
  if (refTotalWeight <= 0) {
    return { ok: false, reason: "A Opção 1 desta refeição ainda não tem gramagens definidas.", items: [], targetMacro: 0, targetKcal: 0 };
  }
  const refProportions = refContribWeights.map((w) => w / refTotalWeight); // soma 1

  if (tgtItems.length === 0) {
    return { ok: false, reason: "Adicione ao menos um alimento nesta opção.", items: [], targetMacro: 0, targetKcal: 0 };
  }

  // Itens do alvo elegíveis a receber peso sugerido: reconhecidos e não-opcionais.
  // Guarda o índice ORIGINAL (pra alinhar com targetOption.items na saída),
  // mas o template de proporção é construído só sobre esse subconjunto.
  const tgtPerGram = tgtItems.map((it) => (it?.optional === true ? null : itemMacrosPerGram(it)));
  const eligibleIdx = tgtPerGram.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (eligibleIdx.length === 0) {
    return { ok: false, reason: "Nenhum alimento desta opção foi reconhecido na TACO ainda.", items: [], targetMacro: 0, targetKcal: 0 };
  }

  const n = eligibleIdx.length;
  let mapped: number[]; // mesma ordem/tamanho de eligibleIdx, soma 1
  if (n === refProportions.length) {
    mapped = [...refProportions];
  } else if (n < refProportions.length) {
    mapped = refProportions.slice(0, n - 1);
    const rest = refProportions.slice(n - 1).reduce((a, b) => a + b, 0);
    mapped.push(rest);
  } else {
    mapped = [...refProportions];
    const last = refProportions[refProportions.length - 1] ?? 1 / n;
    while (mapped.length < n) mapped.push(last);
  }
  const mappedSum = mapped.reduce((a, b) => a + b, 0) || 1;
  mapped = mapped.map((p) => p / mappedSum);

  const refMacros = optionMacros(refOption);
  const targetMacro = refMacros[macroKey];
  const targetKcal = refMacros.kcal;

  const denom = eligibleIdx.reduce((s, origIdx, k) => s + mapped[k] * tgtPerGram[origIdx]![macroKey], 0);
  let x = 0;
  if (denom > 0) {
    x = targetMacro / denom;
  } else {
    // Nenhum item contribui pro macro do `kind` (ex.: alimento de carbo puro
    // faltando na base) — usa kcal como alvo alternativo pra não travar.
    const denomKcal = eligibleIdx.reduce((s, origIdx, k) => s + mapped[k] * tgtPerGram[origIdx]!.kcal, 0);
    x = denomKcal > 0 ? targetKcal / denomKcal : 0;
  }

  const items: ProportionalWeightItem[] = tgtItems.map((_it, i) => {
    const k = eligibleIdx.indexOf(i);
    if (k === -1 || x <= 0) return { index: i, grams: 0, resolved: false };
    const grams = Math.max(0, Math.round((mapped[k] * x) / 5) * 5);
    return { index: i, grams, resolved: true };
  });

  return { ok: true, items, targetMacro, targetKcal };
}

export interface ScaleForMacroDeltaResult {
  ok: boolean;
  reason?: string;
  items: Array<{ index: number; grams: number; resolved: boolean }>;
}

/**
 * Escala as gramagens (peso cru) dos itens de `option` para ACRESCENTAR
 * `deltaGrams` do macro `macroKey` ao total atual da opção, preservando a
 * proporção de peso ATUAL entre os itens já reconhecidos (TACO/industrial).
 *
 * Usado para redistribuir pelas refeições a diferença entre a meta de macro
 * (painel Macros) e o total já montado na dieta — sem trocar os alimentos,
 * só ajustando a quantidade. `deltaGrams` pode ser negativo (reduzir).
 * Itens sem alimento vinculado, sem peso, ou marcados "opcional" (mesma flag
 * que já some do cálculo de kcal em calcItemMacros) ficam de fora e mantêm
 * o peso atual.
 */
export function scaleOptionForMacroDelta(
  option: any,
  macroKey: "protein" | "carbs" | "fat",
  deltaGrams: number,
): ScaleForMacroDeltaResult {
  const items: any[] = Array.isArray(option?.items) ? option.items : [];
  if (items.length === 0) return { ok: false, reason: "Sem alimentos nesta opção.", items: [] };

  const perGramList = items.map((it) => (it?.optional === true ? null : itemMacrosPerGram(it)));
  const weights = items.map((it) => (typeof it?.rawWeight === "number" ? it.rawWeight : 0));
  const resolvedIdx = perGramList
    .map((p, i) => (p && weights[i] > 0 ? i : -1))
    .filter((i) => i >= 0);

  if (resolvedIdx.length === 0) {
    return { ok: false, reason: "Nenhum alimento com peso reconhecido nesta opção.", items: [] };
  }

  const totalWeight = resolvedIdx.reduce((s, i) => s + weights[i], 0);
  const proportions = resolvedIdx.map((i) => weights[i] / totalWeight);

  const weightedMacroPerGram = resolvedIdx.reduce(
    (s, i, k) => s + proportions[k] * perGramList[i]![macroKey],
    0,
  );
  if (weightedMacroPerGram <= 0) {
    return { ok: false, reason: "Os alimentos desta opção não contribuem para esse macro.", items: [] };
  }

  const extraFoodGrams = deltaGrams / weightedMacroPerGram;

  const outItems = items.map((_it, i) => {
    const k = resolvedIdx.indexOf(i);
    if (k === -1) return { index: i, grams: weights[i] ?? 0, resolved: false };
    const add = proportions[k] * extraFoodGrams;
    const grams = Math.max(0, Math.round((weights[i] + add) / 5) * 5);
    return { index: i, grams, resolved: true };
  });

  return { ok: true, items: outItems };
}

/** Limites de tolerância (delta percentual). */
export const SUBSTITUTION_THRESHOLDS = {
  warnKcal: 0.10, warnMacro: 0.15,
  errKcal:  0.20, errMacro:  0.30,
} as const;

export type SubstitutionSeverity = "ok" | "warn" | "err";

export interface SubstitutionDelta {
  kcal: number; protein: number; carbs: number; fat: number;
  kcalPct: number; proteinPct: number; carbsPct: number; fatPct: number;
  severity: SubstitutionSeverity;
  worstMetric: "kcal" | "protein" | "carbs" | "fat" | null;
}

/**
 * Compara uma substituição contra a opção principal e classifica
 * a severidade do desbalanceamento. Usado apenas no painel do coach.
 */
export function compareOptions(main: Macros, alt: Macros): SubstitutionDelta {
  const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 1) : (a - b) / b);
  const d = {
    kcal:    +(alt.kcal    - main.kcal   ).toFixed(1),
    protein: +(alt.protein - main.protein).toFixed(1),
    carbs:   +(alt.carbs   - main.carbs  ).toFixed(1),
    fat:     +(alt.fat     - main.fat    ).toFixed(1),
    kcalPct:    pct(alt.kcal,    main.kcal),
    proteinPct: pct(alt.protein, main.protein),
    carbsPct:   pct(alt.carbs,   main.carbs),
    fatPct:     pct(alt.fat,     main.fat),
  };
  const k = Math.abs(d.kcalPct);
  const macroAbs = [
    { key: "protein" as const, v: Math.abs(d.proteinPct) },
    { key: "carbs"   as const, v: Math.abs(d.carbsPct)   },
    { key: "fat"     as const, v: Math.abs(d.fatPct)     },
  ];
  const worstMacro = macroAbs.reduce((a, b) => (b.v > a.v ? b : a));

  let severity: SubstitutionSeverity = "ok";
  let worstMetric: SubstitutionDelta["worstMetric"] = null;

  if (k >= SUBSTITUTION_THRESHOLDS.errKcal || worstMacro.v >= SUBSTITUTION_THRESHOLDS.errMacro) {
    severity = "err";
  } else if (k >= SUBSTITUTION_THRESHOLDS.warnKcal || worstMacro.v >= SUBSTITUTION_THRESHOLDS.warnMacro) {
    severity = "warn";
  }
  if (severity !== "ok") {
    worstMetric = k >= worstMacro.v ? "kcal" : worstMacro.key;
  }
  return { ...d, severity, worstMetric };
}

// Re-export para conveniência dos consumidores
export { INDUSTRIAL_FOODS };

/**
 * Sugere substituições TACO para um item — mesmo kind/grupo, macro dominante
 * similar (±15%), com gramagem recalculada para equivalência. Máx. 4 itens.
 */
export function suggestTacoSubstitutes(item: any, kind: "carb" | "protein" | "fat"): Array<{ name: string; grams: number; baseName: string; cookFactor: number }> {
  const group: TacoFood["group"] = kind === "carb" ? "carb" : kind === "protein" ? "protein" : "fat";
  const macroField: keyof TacoFood = kind === "carb" ? "c" : kind === "protein" ? "p" : "g";

  if (!item) return [];
  const target = tacoByName(item.baseName || item.name);
  if (!target || !item.rawWeight) return [];

  const targetMacro = (target[macroField] as number) * (item.rawWeight / 100);
  if (!targetMacro) return [];

  const candidates = TACO_FOODS.filter((t) => {
    if (t.group !== group) return false;
    if (t.name === target.name) return false;
    const v = t[macroField] as number;
    return v > 0;
  });

  return candidates
    .map((t) => {
      const v = t[macroField] as number;
      const grams = (targetMacro / v) * 100;
      const refDiff = Math.abs(v - (target[macroField] as number)) / (target[macroField] as number);
      return { name: t.name, grams: Math.round(grams), baseName: t.name, cookFactor: t.cookFactor ?? 1, refDiff };
    })
    .filter((s) => s.refDiff <= 0.5 && s.grams > 0 && s.grams < 1500)
    .sort((a, b) => a.refDiff - b.refDiff)
    .slice(0, 4)
    .map(({ refDiff: _r, ...rest }) => rest);
}

/**
 * Normaliza string para o fuzzy match: remove acentos, prep cooking state words,
 * lowercase, apenas alfanumérico + espaço.
 */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(grelhado|grelhada|cozido|cozida|assado|assada|cru|crua|crus|cruas)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match fuzzy de nomes para TACO (usado no import).
 *
 * FIX: tenta resolveAlias() ANTES do fuzzy.
 * Se o alias resolver encontrar um nome canônico, faz lookup exato —
 * score 1.0, sem custo de varredura. O fuzzy só roda se o alias falhar.
 *
 * Score 0..1; ≥ 0.7 considera-se match.
 * Score entre 0.7 e 0.8 é considerado baixa confiança (zona cinza).
 */
export function fuzzyFindTaco(rawName: string): { taco: TacoFood; score: number; lowConfidence?: boolean } | null {
  if (!rawName) return null;

  // 1. Tenta alias exato primeiro (mais rápido e preciso)
  const canonical = resolveAlias(rawName);
  if (canonical) {
    const found = TACO_FOODS.find((t) => t.name === canonical);
    if (found) return { taco: found, score: 1.0, lowConfidence: false };
  }

  // 2. Fuzzy match clássico
  const q = normalize(rawName);
  if (!q) return null;
  const qTokens = q.split(" ").filter(Boolean);

  let best: { taco: TacoFood; score: number } | null = null;
  TACO_FOODS.forEach((t) => {
    const tn = normalize(t.name);
    let score = 0;
    if (tn === q) score = 1;
    else if (tn.includes(q) || q.includes(tn)) score = 0.9;
    else {
      const tTokens = tn.split(" ").filter(Boolean);
      const hits = qTokens.filter((tok) => tTokens.some((tt) => tt.startsWith(tok) || tok.startsWith(tt))).length;
      score = hits / Math.max(qTokens.length, tTokens.length);
    }
    if (!best || score > best.score) best = { taco: t, score };
  });

  if (!best || best.score < 0.7) return null;

  return {
    taco: best.taco,
    score: best.score,
    lowConfidence: best.score < 0.8,
  };
}

export function parseRawWeight(text: string): number {
  const m = (text || "").match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)?/i);
  if (!m) return 0;
  let v = Number(m[1].replace(",", "."));
  if (m[2] && /kg|l/i.test(m[2])) v *= 1000;
  return Math.round(v);
}
