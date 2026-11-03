/**
 * cookedTwins.ts — alimento COZIDO = alimento CRU ÷ fator de cozimento.
 *
 * REGRA DE PRODUTO (coach): cru e cozido existem só para o ALUNO entender a pesagem.
 * Kcal, proteína, carboidrato, gordura e fibra NÃO dependem do estado: o coach propõe uma
 * quantidade de calorias e ela tem que fechar tanto se o alimento for prescrito cru quanto cozido.
 *
 * Como o sistema garante isso:
 *   - O CRU é a referência. Todo cozido listado abaixo é recalculado a partir do cru
 *     (valor por 100 g do cru ÷ cookFactor do cru), ao carregar o catálogo (tacoFoods.ts).
 *   - A fibra do cozido é calculada do mesmo jeito (macroCalc.ts → resolveFiberPer100).
 *   - Resultado: 100 g de arroz cru e 270 g de arroz cozido (fator 2,7) dão exatamente os mesmos
 *     kcal, macros e fibra. O mesmo vale para feijão, carnes, ovos, tubérculos, legumes…
 *
 * Os números MEDIDOS da TACO/USDA para o cozido continuam escritos nas linhas de tacoFoods.ts e em
 * tacoFiberData.ts, só que não são usados nos cálculos dos alimentos listados aqui. Para voltar a
 * usar o número medido de um alimento, é só apagar a linha dele desta lista.
 *
 * Fora da lista (de propósito): cozidos que levam gordura no preparo (ovo frito, espinafre refogado),
 * enlatados (atum, sardinha), "Mandioquinha / Chuchu (cozido)", que não tem cru, e a goma de tapioca
 * hidratada (é hidratação, não cozimento; a linha medida, 130 kcal, já bate com o fator 2,75 do cru).
 *
 * Chave = nome do cozido em minúsculas · valor = nome EXATO do cru em tacoFoods.ts.
 */
import type { TacoFood } from "./tacoFoods";

export const COOKED_TWINS: Record<string, string> = {
  // Arroz, massas, tubérculos, leguminosas, grãos
  "arroz branco (cozido)": "Arroz branco (cru)",
  "arroz parboilizado (cozido)": "Arroz parboilizado (cru)",
  "arroz integral (cozido)": "Arroz integral (cru)",
  "macarrão de trigo comum (cozido)": "Macarrão de trigo comum (cru)",
  "macarrão integral (cozido)": "Macarrão integral (cru)",
  "macarrão de arroz (cozido)": "Macarrão de arroz (cru)",
  "batata doce (cozida)": "Batata doce (crua)",
  "batata inglesa (cozida)": "Batata inglesa (crua)",
  "mandioca / aipim (cozida)": "Mandioca / Aipim (crua)",
  "inhame (cozido)": "Inhame (cru)",
  "cuscuz de milho (preparado)": "Cuscuz de milho (flocos crus)",
  "quinoa (cozida)": "Quinoa (crua)",
  "feijão carioca (cozido)": "Feijão carioca (cru)",
  "feijão preto (cozido)": "Feijão preto (cru)",
  "lentilha (cozida)": "Lentilha (crua)",
  "grão-de-bico (cozido)": "Grão-de-bico (cru)",

  // Frango e ovos
  "frango peito s/ pele (grelhado)": "Frango peito s/ pele (cru)",
  "frango peito s/ pele (desfiado)": "Frango peito s/ pele (cru)",
  "frango coxa+sobrecoxa (assado)": "Frango coxa+sobrecoxa (cru)",
  "frango coxa+sobrecoxa s/ pele (cozida)": "Frango coxa+sobrecoxa s/ pele (crua)",
  "frango coxa+sobrecoxa c/ pele (assada)": "Frango coxa+sobrecoxa c/ pele (crua)",
  "ovo de galinha inteiro (cozido)": "Ovo de galinha inteiro (cru)",
  "clara de ovo (cozida)": "Clara de ovo (crua/líquida)",

  // Carne bovina
  "patinho (moído/cozido)": "Patinho (cru)",
  "filé mignon (grelhado)": "Filé Mignon (cru)",
  "alcatra (grelhada)": "Alcatra (crua)",
  "coxão mole (cozido)": "Coxão mole (cru)",
  "coxão duro (cozido)": "Coxão duro (cru)",
  "lagarto (cozido)": "Lagarto (cru)",
  "acém (cozido)": "Acém (cru)",
  "músculo (cozido)": "Músculo (cru)",
  "contra-filé (grelhado)": "Contra-filé (cru)",
  "picanha c/ gordura (grelhada)": "Picanha c/ gordura (crua)",
  "picanha s/ gordura (grelhada)": "Picanha s/ gordura (crua)",
  "fígado bovino (grelhado)": "Fígado bovino (cru)",
  "fígado bovino (cozido)": "Fígado bovino (cru)",
  "costela bovina c/ gordura (cozida)": "Costela bovina c/ gordura (crua)",
  "costela bovina s/ gordura (cozida)": "Costela bovina s/ gordura (crua)",
  "cupim (assado)": "Cupim (cru)",
  "maminha (grelhada)": "Maminha (crua)",
  "fraldinha (grelhada)": "Fraldinha (crua)",

  // Carne suína
  "lombo suíno (assado)": "Lombo suíno (cru)",
  "pernil suíno (assado)": "Pernil suíno s/ osso (cru)",
  "bisteca suína (grelhada)": "Bisteca suína (crua)",
  "bisteca suína c/ gordura (grelhada)": "Bisteca suína c/ gordura (crua)",
  "bisteca suína s/ gordura (grelhada)": "Bisteca suína s/ gordura (crua)",

  // Peixes
  "tilápia (grelhada/assada)": "Tilápia / St. Peters (crua)",
  "salmão s/ pele (grelhado)": "Salmão s/ pele (cru)",
  "merluza (grelhada/assada)": "Merluza / Pescada (crua)",

  // Legumes e verduras (fator 1: o peso não muda, então o cozido tem os mesmos valores do cru)
  "brócolis (cozido/vapor)": "Brócolis (cru)",
  "couve-flor (cozida)": "Couve-flor (crua)",
  "cenoura (cozida)": "Cenoura (crua)",
  "abobrinha italiana (cozida)": "Abobrinha italiana (crua)",
  "abóbora cabotian (cozida)": "Abóbora cabotian (crua)",
  "chuchu (cozido)": "Chuchu (cru)",
  "beterraba (cozida)": "Beterraba (crua)",
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Fator cozido ÷ cru usado na conversão (1 quando o cru não tem fator). */
export function twinFactor(raw: Pick<TacoFood, "cookFactor">): number {
  return typeof raw.cookFactor === "number" && raw.cookFactor > 0 ? raw.cookFactor : 1;
}

/**
 * Devolve o catálogo com cada cozido listado em COOKED_TWINS recalculado a partir do cru.
 * Nome, grupo, porções e flags do cozido são preservados; só kcal/p/c/g mudam.
 * Nunca lança erro: se um nome não existir, a linha fica como está (o teste cookedTwins acusa).
 */
export function applyCookedTwins(foods: TacoFood[]): TacoFood[] {
  const byName = new Map(foods.map((f) => [f.name, f] as const));
  return foods.map((f) => {
    const rawName = COOKED_TWINS[f.name.toLowerCase()];
    if (!rawName) return f;
    const raw = byName.get(rawName);
    if (!raw) return f;
    const cf = twinFactor(raw);
    return { ...f, kcal: r1(raw.kcal / cf), p: r2(raw.p / cf), c: r2(raw.c / cf), g: r2(raw.g / cf) };
  });
}
