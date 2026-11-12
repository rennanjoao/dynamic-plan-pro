/**
 * fiberEquivalents.ts — Ponte de fibra entre a base legada e a base TACO enriquecida.
 *
 * CONTEXTO
 * A base legada (`TACO_FOODS`, nomes como "Arroz branco (cru)") foi cadastrada sem o campo
 * `fiber`. Só os itens de `ENRICHED_FOODS` (nomes como "Arroz, tipo 1, cru"), que vieram da
 * planilha oficial TACO 4ª ed., têm fibra. Resultado: o coach escolhia "Arroz branco (cru)" e
 * a fibra do dia ficava em 0, sem nenhum aviso.
 *
 * REGRA DESTA TABELA
 * Só entra aqui o par em que o alimento legado é, comprovadamente, o MESMO alimento no MESMO
 * estado (cru ↔ cru) de um item enriquecido. O valor NÃO é digitado aqui: é lido de
 * `ENRICHED_FOODS` em tempo de execução, então continua rastreável à planilha TACO.
 *
 * NÃO entram:
 *  - versões "cozido/grelhado/assado": converter fibra de cru para cozido por fator de
 *    cozimento NÃO é confiável (a TACO mede cada estado separadamente);
 *  - alimentos sem equivalente exato na base enriquecida;
 *  - "Batata doce (crua)": já tem os valores da TACO crua (118 kcal) e a fibra direto em tacoFoods.ts,
 *    então não precisa desta ponte.
 * Esses ficam como "sem dado de fibra" e a interface avisa o coach (nunca assume 0).
 *
 * Para completar a base: preencha `fiber` direto em `tacoFoods.ts` (tem prioridade sobre esta
 * ponte) a partir da coluna "Fibra Alimentar" da planilha TACO.
 */

/** nome legado (minúsculo) → nome exato em ENRICHED_FOODS */
export const LEGACY_TO_ENRICHED_FIBER: Record<string, string> = {
  "arroz branco (cru)": "Arroz, tipo 1, cru",
  "arroz integral (cru)": "Arroz, integral, cru",
  "macarrão de trigo comum (cru)": "Macarrão, trigo, cru",
  "batata inglesa (crua)": "Batata, inglesa, crua",
  "mandioca / aipim (crua)": "Mandioca, crua",
  "inhame (cru)": "Inhame, cru",
  "pão francês": "Pão, trigo, francês",
  "pão de forma integral": "Pão, trigo, forma, integral",
  "aveia em flocos": "Aveia, flocos, crua",
  "feijão carioca (cru)": "Feijão, carioca, cru",
  "feijão preto (cru)": "Feijão, preto, cru",
  "lentilha (crua)": "Lentilha, crua",
  "grão-de-bico (cru)": "Grão-de-bico, cru",
};

/**
 * Alimentos de origem animal / óleos / laticínios, nos quais fibra = 0 é um fato nutricional
 * (e não ausência de dado). Aplicado só aos grupos protein, dairy e (para óleos/manteiga/gema) fat.
 * Texto comparado sem acento e em minúsculas.
 */
export const ZERO_FIBER_NAME_PATTERN =
  /frango|\bovo\b|\bovos\b|clara|gema|patinho|file mignon|alcatra|coxao|lagarto|acem|musculo|contra-file|picanha|figado|costela|cupim|maminha|fraldinha|suin|tilapia|salmao|atum|sardinha|merluza|camarao|whey|albumina|azeite|oleo de coco|manteiga|\bleite de vaca|leite em po|iogurte|queijo|ricota|requeijao|cream cheese|creme de leite/;
