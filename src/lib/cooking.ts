/**
 * cooking.ts — ÚNICA fonte de verdade da conversão CRU → COZIDO mostrada ao aluno.
 *
 * Regra de produto:
 *  - O coach SEMPRE prescreve pelo peso CRU (é ele que alimenta os macros).
 *  - O aluno pode alternar a tela para COZIDO só como conveniência de pesagem.
 *  - Essa alternância NUNCA muda os macros, o rawWeight salvo nem a lista de compras;
 *    muda apenas o peso/nome exibido, e os dois têm que ser coerentes entre si.
 *
 * Invariantes garantidas aqui (e cobertas em __tests__/cooking.test.ts):
 *  1. Alimento que JÁ é cozido (valuesArCooked ou nome "cozido/grelhado/assado…")
 *     nunca é convertido de novo.
 *  2. Peso convertido sempre vem acompanhado do nome em estado cozido
 *     ("(cru)" → "(cozido)"); o aluno nunca vê "cru" ao lado de peso cozido.
 *  3. Alimento sem conversão real (fator 1: frutas, folhas, aveia, pão…) mantém
 *     peso e nome exatamente como o coach prescreveu.
 *  4. O fator vem do catálogo (mesma tabela do picker do coach); só itens digitados
 *     à mão, sem vínculo com a tabela, usam o fallback por família — e o fallback
 *     usa os mesmos números do catálogo.
 */

import { TACO_FOODS, type TacoFood } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";

export type CookState = "raw" | "cooked" | "neutral";

export interface CookInfo {
  /** raw = prescrito cru · cooked = já é cozido · neutral = não se aplica */
  state: CookState;
  /** peso cozido ÷ peso cru (1 = não converte) */
  factor: number;
  /** alimento do catálogo, quando houve vínculo exato */
  food?: TacoFood;
}

// ─── Detecção de estado pelo texto ────────────────────────────────────────────
const COOKED_MARKER = /(cozid|grelhad|assad|refogad|frit[oa]|vapor|desfiad|preparad|mexid|pront[oa]|hidratad)/i;
const RAW_MARKER = /\bcr(?:u|ua|us|uas)\b/i;

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const clean = (s: string) => (s || "").replace(/<[^>]*>/g, "").trim();

export function hasCookedMarker(name: string): boolean {
  return COOKED_MARKER.test(clean(name));
}
export function hasRawMarker(name: string): boolean {
  return RAW_MARKER.test(clean(name));
}

// ─── Catálogo (ENRICHED tem prioridade, igual ao picker do coach) ─────────────
const CATALOG = new Map<string, TacoFood>();
for (const f of TACO_FOODS) CATALOG.set(f.name.trim().toLowerCase(), f);
for (const f of ENRICHED_FOODS) CATALOG.set(f.name.trim().toLowerCase(), f);

export function findCatalogFood(name: string): TacoFood | undefined {
  return CATALOG.get(clean(name).toLowerCase());
}

/** True quando os macros desta entrada são por 100 g de alimento JÁ cozido. */
export function isCookedEntry(food: Pick<TacoFood, "name" | "valuesArCooked">): boolean {
  return !!food.valuesArCooked || (hasCookedMarker(food.name) && !hasRawMarker(food.name));
}

// ─── Fallback por família (somente itens SEM vínculo com a tabela) ────────────
// Mesmos números do catálogo. Ordem importa: a primeira regra que casar vence.
const FALLBACK_RULES: Array<[RegExp, number]> = [
  [/(atum|sardinha).*(lata|conserva|drenad)|(lata|conserva|drenad).*(atum|sardinha)/, 1],
  [/\b(pao|aveia|granola|cereal)\b/, 1],
  [/(empanad|nugget|linguica|salsicha|presunto|mortadela|blanquet|fatiad|defumad)/, 1],
  [/arroz.*integral|integral.*arroz/, 2.8],
  [/arroz.*parboil/, 2.8],
  [/macarrao.*arroz/, 2.7],
  [/\barroz\b/, 2.7],
  [/(macarrao|massa|talharim|espaguete|spaghetti|penne|fusilli)/, 2.5],
  [/(cuscuz|quinoa)/, 3],
  [/feijao/, 2.4],
  [/(lentilha|ervilha)/, 3],
  [/grao.de.bico/, 2.2],
  [/(batata|mandioca|aipim|macaxeira|inhame|\bcara\b)/, 1], // peso cru é o contabilizado
  [/(frango|galinha)/, 0.7],
  [/\bperu\b/, 0], // 0 = tratar abaixo (peito de peru frio já vem pronto)
  [/(acem|musculo|costela)/, 0.65],
  [/(patinho|alcatra|coxao|file mignon|contra.?file|lagarto)/, 0.65], // bife magro: a TACO mostra ~0,6–0,65
  [/(patinho|alcatra|coxao|file mignon|carne|\bboi\b|bovin|suin|porco|lombo|pernil|bisteca|picanha|maminha|fraldinha|contra.?file|lagarto|cupim)/, 0.7],
  [/(figado|coracao|moela)/, 0.7],
  [/(peixe|tilapia|merluza|pescada|bacalhau|salmao|atum|camarao|fruto.*mar)/, 0.75],
  [/\bovos?\b/, 0.98],
];

export function fallbackCookFactor(name: string): number {
  const s = stripAccents(clean(name).toLowerCase());
  for (const [re, f] of FALLBACK_RULES) {
    if (!re.test(s)) continue;
    if (f === 0) return /(cru|file|moid)/.test(s) ? 0.7 : 1;
    return f;
  }
  return 1;
}

// ─── Resolução principal ──────────────────────────────────────────────────────
export function cookInfo(name: string): CookInfo {
  const n = clean(name);
  const food = findCatalogFood(n);

  if (food) {
    if (isCookedEntry(food)) return { state: "cooked", factor: 1, food };
    const f = typeof food.cookFactor === "number" && food.cookFactor > 0 ? food.cookFactor : 1;
    return { state: f !== 1 || hasRawMarker(food.name) ? "raw" : "neutral", factor: f, food };
  }

  // Item digitado à mão: o nome já diz "cozido/grelhado…" → peso já é de alimento pronto.
  if (hasCookedMarker(n)) return { state: "cooked", factor: 1 };

  const f = fallbackCookFactor(n);
  return { state: f !== 1 ? "raw" : "neutral", factor: f };
}

/** Multiplicador efetivo para a tela do aluno (1 no modo Cru). */
export function cookMultiplier(name: string, isCooked: boolean): number {
  return isCooked ? cookInfo(name).factor : 1;
}

// ─── Nome exibido ─────────────────────────────────────────────────────────────
const RAW_TO_COOKED: Record<string, string> = {
  cru: "cozido",
  crua: "cozida",
  crus: "cozidos",
  cruas: "cozidas",
};

/** Nomes em que "cozido" não é o termo certo do estado pronto. */
const COOKED_NAME_OVERRIDE: Record<string, string> = {
  "tapioca (goma seca/polvilho)": "Tapioca (goma hidratada)",
};

function keepCase(from: string, to: string): string {
  if (from === from.toUpperCase() && from.length > 1) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase()) return to[0].toUpperCase() + to.slice(1);
  return to;
}

/**
 * Nome a exibir ao aluno.
 *  - Modo Cru → nome como o coach prescreveu.
 *  - Modo Cozido e item convertido (fator ≠ 1) → troca "cru/crua" por "cozido/cozida"
 *    (ou acrescenta "(cozido)" se o nome não tinha marcador), para o rótulo bater com o peso.
 *  - Qualquer outro caso → nome intacto.
 */
export function displayFoodName(name: string, isCooked: boolean): string {
  const n = clean(name);
  if (!isCooked || !n) return n;
  const info = cookInfo(n);
  if (info.state !== "raw" || info.factor === 1) return n;
  const override = COOKED_NAME_OVERRIDE[n.toLowerCase()];
  if (override) return override;
  if (hasRawMarker(n)) {
    return n.replace(RAW_MARKER, (m) => keepCase(m, RAW_TO_COOKED[m.toLowerCase()] ?? "cozido"));
  }
  return `${n} (cozido)`;
}

/** Peso convertido (inteiro, em gramas/ml) — mesma conta usada na tela. */
export function convertGrams(rawGrams: number, factor: number): number {
  return Math.round(rawGrams * factor);
}
