/**
 * tacoFiberData.ts — Fibra alimentar dos alimentos da base legada (`TACO_FOODS`), lida da TACO.
 *
 * FONTE
 * Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição revisada e ampliada,
 * NEPA/UNICAMP, 2011 — Tabela 1, coluna "Fibra Alimentar (g)", por 100 g de parte comestível.
 * https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf
 * Convenções da TACO: NA = não aplicável (tratado como 0) · Tr = traços (tratado como 0).
 *
 * POR QUE EXISTE
 * A base legada foi cadastrada sem o campo `fiber`. Em vez de reescrever `tacoFoods.ts`, cada
 * alimento fica ligado aqui ao item EXATO da TACO (`taco`), com a energia dele (`tacoKcal`).
 * Um teste confere que o legado e o item da TACO têm energia compatível, para impedir que um
 * alimento seja ligado ao estado errado (cru ↔ cozido), como no caso da batata-doce (crua), cujos valores legados são os da cozida.
 *
 * REGRAS
 *  - Só entra o MESMO alimento no MESMO estado. Sem item equivalente na TACO → fica de fora
 *    (a tela mostra "sem dado de fibra"; nunca se assume 0).
 *  - `fiber` escrito direto em `tacoFoods.ts` tem prioridade sobre esta tabela.
 *  - A chave é o nome legado em minúsculas, exatamente como em `tacoFoods.ts`.
 */

export interface TacoFiberEntry {
  /** Fibra alimentar total, g por 100 g (como na TACO). */
  fiber: number;
  /** Descrição exata do alimento na TACO 4ª edição. */
  taco: string;
  /** Energia (kcal/100 g) do item da TACO — usada só para validar o mapeamento. */
  tacoKcal: number;
  /** Observação quando o par não é idêntico. */
  note?: string;
}

export const LEGACY_TACO_FIBER: Record<string, TacoFiberEntry> = {
  "arroz branco (cozido)": { fiber: 1.56, taco: "Arroz, tipo 1, cozido", tacoKcal: 128 },
  "arroz integral (cozido)": { fiber: 2.75, taco: "Arroz, integral, cozido", tacoKcal: 124 },
  "batata doce (crua)": { fiber: 2.21, taco: "Batata, doce, cozida", tacoKcal: 77, note: "Valores do legado (77 kcal, 18,4 g de carbo) são os da batata-doce COZIDA na TACO; a fibra segue os mesmos valores para manter a linha coerente. Confira o cadastro." },
  "batata doce (cozida)": { fiber: 2.21, taco: "Batata, doce, cozida", tacoKcal: 77 },
  "batata inglesa (cozida)": { fiber: 1.34, taco: "Batata, inglesa, cozida", tacoKcal: 52 },
  "mandioca / aipim (cozida)": { fiber: 1.56, taco: "Mandioca, cozida", tacoKcal: 125 },
  "cuscuz de milho (preparado)": { fiber: 2.05, taco: "Cuscuz, de milho, cozido com sal", tacoKcal: 113 },
  "feijão carioca (cozido)": { fiber: 8.51, taco: "Feijão, carioca, cozido", tacoKcal: 76 },
  "feijão preto (cozido)": { fiber: 8.4, taco: "Feijão, preto, cozido", tacoKcal: 77 },
  "feijão fradinho (cru)": { fiber: 23.59, taco: "Feijão, fradinho, cru", tacoKcal: 339 },
  "lentilha (cozida)": { fiber: 7.86, taco: "Lentilha, cozida", tacoKcal: 93, note: "Legado 116 kcal vs TACO 93 kcal (mesmo alimento, valores de outra fonte)." },
  "pipoca (estourada sem óleo)": { fiber: 14.34, taco: "Pipoca, com óleo de soja, sem sal", tacoKcal: 448, note: "A TACO só traz pipoca COM óleo de soja; a fibra por 100 g é praticamente a mesma da estourada sem óleo." },
  "açúcar branco / refinado": { fiber: 0.0, taco: "Açúcar, refinado", tacoKcal: 387, note: "TACO: NA (não aplicável) — fibra zero." },
  "açúcar mascavo": { fiber: 0.0, taco: "Açúcar, mascavo", tacoKcal: 369, note: "TACO: NA (não aplicável) — fibra zero." },
  "mel de abelha": { fiber: 0.0, taco: "Mel, de abelha", tacoKcal: 309, note: "TACO: NA (não aplicável) — fibra zero." },
  "amendoim torrado (s/ pele/sal)": { fiber: 7.76, taco: "Amendoim, torrado, salgado", tacoKcal: 606, note: "A TACO traz o torrado SALGADO; o sal não altera a fibra." },
  "castanha de caju (torrada)": { fiber: 3.66, taco: "Castanha-de-caju, torrada, salgada", tacoKcal: 570, note: "A TACO traz a torrada SALGADA; o sal não altera a fibra." },
  "castanha do pará / brasil": { fiber: 7.93, taco: "Castanha-do-Brasil, crua", tacoKcal: 643 },
  "nozes": { fiber: 7.25, taco: "Noz, crua", tacoKcal: 620 },
  "amêndoa (torrada)": { fiber: 11.64, taco: "Amêndoa, torrada, salgada", tacoKcal: 581, note: "A TACO traz a torrada SALGADA; o sal não altera a fibra." },
  "abacate (polpa)": { fiber: 6.31, taco: "Abacate, cru", tacoKcal: 96 },
  "coco fresco (polpa crua)": { fiber: 5.38, taco: "Coco, cru", tacoKcal: 406, note: "Legado 354 kcal vs TACO 406 kcal (mesmo alimento, valores de outra fonte)." },
  "leite de coco (garrafinha)": { fiber: 0.68, taco: "Leite, de coco", tacoKcal: 166 },
  "linhaça (sementes)": { fiber: 33.5, taco: "Linhaça, semente", tacoKcal: 495 },
  "banana prata (crua)": { fiber: 2.04, taco: "Banana, prata, crua", tacoKcal: 98 },
  "banana nanica (crua)": { fiber: 1.95, taco: "Banana, nanica, crua", tacoKcal: 92 },
  "banana da terra (crua)": { fiber: 1.53, taco: "Banana, da terra, crua", tacoKcal: 128 },
  "maçã fuji (com casca)": { fiber: 1.35, taco: "Maçã, Fuji, com casca, crua", tacoKcal: 56 },
  "mamão papaia": { fiber: 1.04, taco: "Mamão, Papaia, cru", tacoKcal: 40 },
  "mamão formosa": { fiber: 1.81, taco: "Mamão, Formosa, cru", tacoKcal: 45 },
  "morango": { fiber: 1.72, taco: "Morango, cru", tacoKcal: 30 },
  "abacaxi": { fiber: 0.99, taco: "Abacaxi, cru", tacoKcal: 48 },
  "manga palmer / tommy": { fiber: 1.63, taco: "Manga, Palmer, crua", tacoKcal: 72, note: "Usa a Palmer (1,63 g); a Tommy Atkins tem 2,07 g na TACO." },
  "uva itália / rubi": { fiber: 0.92, taco: "Uva, Itália, crua", tacoKcal: 53, note: "Itália 0,92 g; Rubi 0,93 g." },
  "melancia": { fiber: 0.12, taco: "Melancia, crua", tacoKcal: 33 },
  "melão": { fiber: 0.25, taco: "Melão, cru", tacoKcal: 29 },
  "laranja pera": { fiber: 0.77, taco: "Laranja, pêra, crua", tacoKcal: 37 },
  "suco de laranja pera (integral)": { fiber: 0.0, taco: "Laranja, pêra, suco", tacoKcal: 33, note: "TACO: Tr (traços) — tratado como zero." },
  "limão tahiti": { fiber: 1.18, taco: "Limão, tahiti, cru", tacoKcal: 32 },
  "kiwi": { fiber: 2.65, taco: "Kiwi, cru", tacoKcal: 51 },
  "pera (com casca)": { fiber: 3.01, taco: "Pêra, Williams, crua", tacoKcal: 53, note: "Williams 3,01 g; Park 2,98 g." },
  "goiaba": { fiber: 6.22, taco: "Goiaba, vermelha, com casca, crua", tacoKcal: 54, note: "Vermelha 6,22 g; branca 6,33 g." },
  "brócolis (cru)": { fiber: 2.88, taco: "Brócolis, cru", tacoKcal: 25 },
  "brócolis (cozido/vapor)": { fiber: 3.42, taco: "Brócolis, cozido", tacoKcal: 25 },
  "couve-flor (crua)": { fiber: 2.35, taco: "Couve-flor, crua", tacoKcal: 23 },
  "couve-flor (cozida)": { fiber: 2.13, taco: "Couve-flor, cozida", tacoKcal: 19 },
  "espinafre (cru)": { fiber: 2.1, taco: "Espinafre, Nova Zelândia, cru", tacoKcal: 16 },
  "cenoura (crua)": { fiber: 3.18, taco: "Cenoura, crua", tacoKcal: 34 },
  "cenoura (cozida)": { fiber: 2.63, taco: "Cenoura, cozida", tacoKcal: 30 },
  "abobrinha italiana (crua)": { fiber: 1.35, taco: "Abobrinha, italiana, crua", tacoKcal: 19 },
  "abobrinha italiana (cozida)": { fiber: 1.59, taco: "Abobrinha, italiana, cozida", tacoKcal: 15 },
  "abóbora cabotian (crua)": { fiber: 2.17, taco: "Abóbora, cabotian, crua", tacoKcal: 39 },
  "abóbora cabotian (cozida)": { fiber: 2.46, taco: "Abóbora, cabotian, cozida", tacoKcal: 48 },
  "alface americana": { fiber: 1.02, taco: "Alface, americana, crua", tacoKcal: 9 },
  "alface crespa": { fiber: 1.83, taco: "Alface, crespa, crua", tacoKcal: 11 },
  "rúcula": { fiber: 1.74, taco: "Rúcula, crua", tacoKcal: 13 },
  "tomate salada": { fiber: 1.17, taco: "Tomate, com semente, cru", tacoKcal: 15, note: "Valores do legado (15 kcal) coincidem com 'Tomate, com semente, cru'; a TACO 'Tomate, salada' tem 2,27 g." },
  "pepino (cru com casca)": { fiber: 1.12, taco: "Pepino, cru", tacoKcal: 10 },
  "chuchu (cru)": { fiber: 1.28, taco: "Chuchu, cru", tacoKcal: 17 },
  "chuchu (cozido)": { fiber: 1.04, taco: "Chuchu, cozido", tacoKcal: 19 },
  "beterraba (crua)": { fiber: 3.37, taco: "Beterraba, crua", tacoKcal: 49 },
  "beterraba (cozida)": { fiber: 1.88, taco: "Beterraba, cozida", tacoKcal: 32 },
  "berinjela (crua)": { fiber: 2.87, taco: "Berinjela, crua", tacoKcal: 20 },
  "repolho branco (cru)": { fiber: 1.89, taco: "Repolho, branco, cru", tacoKcal: 17 },
  "cebola (crua)": { fiber: 2.19, taco: "Cebola, crua", tacoKcal: 39 },
  "creme de arroz (genérico)": { fiber: 1.07, taco: "Creme de arroz, pó", tacoKcal: 386, note: "Produto industrializado genérico (src/data/industrialFoods.ts); a TACO traz o creme de arroz em pó." },
};
