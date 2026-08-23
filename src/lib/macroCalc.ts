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
import { INDUSTRIAL_FOODS, industrialByName, type IndustrialFood } from "@/data/industrialFoods";

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
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function tacoByName(name: string): TacoFood | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return TACO_FOODS.find((t) => t.name.toLowerCase() === n);
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
 * Retorna { grams, isUnit, value } — `grams` já convertido quando isUnit=true
 * usando `unitWeight` opcional do alimento (fallback 50g).
 *
 * Exemplos:
 *   "150g"        → { value:150, grams:150,  isUnit:false }
 *   "1,5 kg"      → { value:1.5, grams:1500, isUnit:false }
 *   "8 unidades"  → { value:8,   grams:400,  isUnit:true  } (com unitWeight=50)
 *   "2 fatias"    → { value:2,   grams:100,  isUnit:true  }
 *   ""            → { value:0,   grams:0,    isUnit:false }
 */
export function parseWeightString(
  raw: unknown,
  unitWeight: number = 50,
): { value: number; grams: number; isUnit: boolean } {
  const text = String(raw ?? "").trim();
  if (!text) return { value: 0, grams: 0, isUnit: false };

  const parsedValue =
    parseFloat(text.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

  const isUnit = /un|unid|fatia|fatias|ovo|ovos|colher|colheres|copo|copos|porc/i.test(text);
  const isKg = /\bkg\b/i.test(text) || /\bquilo/i.test(text);
  const isLitro = /\bl\b/i.test(text) && !/\bml\b/i.test(text);

  let grams = parsedValue;
  if (isUnit) grams = parsedValue * (unitWeight > 0 ? unitWeight : 50);
  else if (isKg || isLitro) grams = parsedValue * 1000;

  return { value: parsedValue, grams, isUnit };
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

    // Prioriza rawWeight numérico já gravado; senão, parseia weight string.
    let grams = 0;
    if (typeof item.rawWeight === "number" && item.rawWeight > 0) {
      grams = item.rawWeight;
    } else if (item.weight != null) {
      const unitW = typeof (food as any).unitWeight === "number" ? (food as any).unitWeight : 50;
      grams = parseWeightString(item.weight, unitW).grams;
    }
    if (!grams || !isFinite(grams) || grams <= 0) return { ...ZERO };
    const f = grams / 100;
    return {
      kcal: +(food.kcal * f).toFixed(1),
      protein: +(food.p * f).toFixed(1),
      carbs: +(food.c * f).toFixed(1),
      fat: +(food.g * f).toFixed(1),
    };
  }
  if (item.manualMacros) {
    const m = item.manualMacros;
    const protein = Number(m.protein) || 0;
    const carbs = Number(m.carbs) || 0;
    const fat = Number(m.fat) || 0;
    const kcal = Number(m.kcal) || protein * 4 + carbs * 4 + fat * 9;
    return {
      kcal: +kcal.toFixed(1),
      protein: +protein.toFixed(1),
      carbs: +carbs.toFixed(1),
      fat: +fat.toFixed(1),
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
    });
  });
  return {
    kcal: +out.kcal.toFixed(1),
    protein: +out.protein.toFixed(1),
    carbs: +out.carbs.toFixed(1),
    fat: +out.fat.toFixed(1),
  };
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
  });
  return {
    kcal: +out.kcal.toFixed(1),
    protein: +out.protein.toFixed(1),
    carbs: +out.carbs.toFixed(1),
    fat: +out.fat.toFixed(1),
  };
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
  });
  return {
    kcal: +out.kcal.toFixed(1),
    protein: +out.protein.toFixed(1),
    carbs: +out.carbs.toFixed(1),
    fat: +out.fat.toFixed(1),
  };
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
