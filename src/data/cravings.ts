/**
 * cravings.ts — Opções do S.O.S TPM ("Válvula de Escape")
 *
 * REGRAS DO PRODUTO (travadas em __tests__/cravings.test.ts)
 *  1. Quatro grupos, do mais natural ao mais processado: Naturais, Caseiros e tradicionais,
 *     Industrializados e Troca de refeição. Dentro de cada grupo, por kcal crescente.
 *  2. Snacks: gordura padrão de até LIMITE_GORDURA_PADRAO_G por porção. Acima disso a opção é de
 *     "porção fixa" (chocolates, bombom, paçoca...), com teto de LIMITE_GORDURA_FIXA_G.
 *  3. SEM oleaginosas a granel nem pastas. Amendoim só nos itens que o contêm por natureza
 *     (Snickers, minis, bombom, paçoca), sempre com o aviso "Contém amendoim". Coco só no beijinho.
 *  4. Pipoca só de milho feito na água, de 30 a 50 g. Nunca de micro-ondas.
 *  5. Toda linha de ingrediente com kcal tem gramas/ml. kcal e macros são CALCULADOS a partir dos
 *     ingredientes. Nunca digite kcal à mão.
 *
 * FONTE dos valores por 100 g:
 *  - "taco-app":    mesma tabela do app (tacoFoods.ts). O teste confere se não divergiu.
 *  - "taco-online": TACO/IBGE (tabelatacoonline.com.br).
 *  - "rotulo":      média de rótulos/bases de mercado. Marca diferente pode variar um pouco.
 */

export type Grupo = "natural" | "caseiro" | "industrializado" | "troca";
export type Categoria = "doce" | "chocolate" | "gelado" | "crocante" | "quentinho";
export type Flag = "lactose" | "gluten" | "amendoim";

export const LIMITE_GORDURA_PADRAO_G = 2.5;
export const LIMITE_GORDURA_FIXA_G = 8;
export const LIMITE_GORDURA_TROCA_G = 20;
export const LIMITE_KCAL_SNACK = 215;
export const LIMITE_KCAL_TROCA = 500;
export const MAX_PORCAO_FIXA = 12;

/** Oleaginosas a granel e pastas: nenhuma menção nos dados, em nenhum item. */
export const OLEAGINOSAS_PROIBIDAS = /castanha|am[eê]ndoa|\bnozes?\b|pistache|avel[ãa]|macad[âa]mia|pasta de/i;
/** Amendoim: só em item que declare o aviso "amendoim". */
export const AMENDOIM = /amendoim|pa[çc]oca/i;

export const GRUPOS: { id: Grupo; nome: string; subtitulo: string }[] = [
  { id: "natural", nome: "Naturais", subtitulo: "Fruta e comida de verdade" },
  { id: "caseiro", nome: "Caseiros e tradicionais", subtitulo: "Doces de panela, conservas e pães" },
  { id: "industrializado", nome: "Industrializados", subtitulo: "Produtos prontos, sempre em porção medida" },
  { id: "troca", nome: "Troca de refeição", subtitulo: "Use no lugar de uma refeição do dia, não além dela" },
];

export const CATEGORIAS: { id: Categoria; label: string }[] = [
  { id: "doce", label: "Doce" },
  { id: "chocolate", label: "Chocolate" },
  { id: "gelado", label: "Gelado" },
  { id: "crocante", label: "Crocante" },
  { id: "quentinho", label: "Quentinho" },
];

export const ROTULO_FLAG: Record<Flag, string> = {
  lactose: "Contém lactose",
  gluten: "Contém glúten",
  amendoim: "Contém amendoim",
};

export interface Ingrediente {
  nome: string;
  /** valores por 100 g */
  kcal: number;
  p: number;
  c: number;
  g: number;
  fonte: "taco-app" | "taco-online" | "rotulo";
  /** nome exato em TACO_FOODS (fonte "taco-app"); o teste confere os valores */
  tacoNome?: string;
  contem?: Flag[];
}

const defs = {
  morango: { nome: "Morango", kcal: 30, p: 0.9, c: 6.8, g: 0.3, fonte: "taco-app", tacoNome: "Morango" },
  bananaPrata: { nome: "Banana prata", kcal: 89, p: 1.3, c: 23.8, g: 0.1, fonte: "taco-app", tacoNome: "Banana prata (crua)" },
  macaFuji: { nome: "Maçã fuji", kcal: 56, p: 0.3, c: 15.2, g: 0, fonte: "taco-app", tacoNome: "Maçã fuji (com casca)" },
  abacaxi: { nome: "Abacaxi", kcal: 48, p: 0.9, c: 12.3, g: 0.1, fonte: "taco-app", tacoNome: "Abacaxi" },
  uva: { nome: "Uva itália / rubi", kcal: 68, p: 0.6, c: 17.3, g: 0.1, fonte: "taco-app", tacoNome: "Uva itália / rubi" },
  melancia: { nome: "Melancia", kcal: 30, p: 0.6, c: 7.5, g: 0.1, fonte: "taco-app", tacoNome: "Melancia" },
  pepino: { nome: "Pepino", kcal: 10, p: 0.9, c: 2, g: 0.1, fonte: "taco-app", tacoNome: "Pepino (cru com casca)" },
  cenoura: { nome: "Cenoura crua", kcal: 34, p: 1.3, c: 7.7, g: 0.2, fonte: "taco-app", tacoNome: "Cenoura (crua)" },
  tomate: { nome: "Tomate", kcal: 15, p: 1.1, c: 3.1, g: 0.2, fonte: "taco-app", tacoNome: "Tomate salada" },
  mel: { nome: "Mel", kcal: 320, p: 0.3, c: 82, g: 0, fonte: "taco-app", tacoNome: "Mel de abelha" },
  paoForma: { nome: "Pão de forma tradicional", kcal: 253, p: 8.5, c: 49.9, g: 2, fonte: "taco-app", tacoNome: "Pão de forma tradicional", contem: ["gluten"] },
  paoIntegral: { nome: "Pão de forma integral", kcal: 253, p: 9.4, c: 49.9, g: 2.9, fonte: "taco-app", tacoNome: "Pão de forma integral", contem: ["gluten"] },
  paoFrances: { nome: "Pão francês", kcal: 300, p: 8, c: 58.6, g: 3.1, fonte: "taco-app", tacoNome: "Pão francês", contem: ["gluten"] },
  tapiocaGoma: { nome: "Goma de tapioca hidratada", kcal: 130, p: 0.1, c: 32.1, g: 0.2, fonte: "taco-app", tacoNome: "Tapioca (goma hidratada/pronta)" },
  batata: { nome: "Batata inglesa crua", kcal: 64, p: 1.2, c: 14.7, g: 0.1, fonte: "taco-app", tacoNome: "Batata inglesa (crua)" },
  iogurteDesnatado: { nome: "Iogurte natural desnatado", kcal: 41, p: 4.1, c: 5.9, g: 0.1, fonte: "taco-app", tacoNome: "Iogurte natural desnatado", contem: ["lactose"] },
  leiteDesnatado: { nome: "Leite desnatado", kcal: 35, p: 3.4, c: 4.9, g: 0.2, fonte: "taco-app", tacoNome: "Leite de vaca desnatado (líquido)", contem: ["lactose"] },
  wheyConcentrado: { nome: "Whey concentrado", kcal: 400, p: 80, c: 8, g: 6, fonte: "taco-app", tacoNome: "Whey Protein Concentrado (80%)", contem: ["lactose"] },
  leitePoDesnatado: { nome: "Leite em pó desnatado", kcal: 362, p: 36, c: 52, g: 0.8, fonte: "taco-app", tacoNome: "Leite em pó desnatado", contem: ["lactose"] },
  mucarela: { nome: "Mussarela", kcal: 300, p: 21.6, c: 2.4, g: 23, fonte: "taco-app", tacoNome: "Queijo Muçarela", contem: ["lactose"] },
  minasFrescal: { nome: "Queijo minas frescal", kcal: 264, p: 17.4, c: 3.2, g: 20.2, fonte: "taco-app", tacoNome: "Queijo Minas Frescal", contem: ["lactose"] },
  requeijaoLight: { nome: "Requeijão light", kcal: 140, p: 8, c: 4, g: 10.5, fonte: "taco-app", tacoNome: "Requeijão light", contem: ["lactose"] },
  patinhoCru: { nome: "Patinho moído cru", kcal: 133, p: 21.7, c: 0, g: 4.5, fonte: "taco-app", tacoNome: "Patinho (cru)" },
  contraFileCru: { nome: "Contrafilé cru", kcal: 145, p: 21.4, c: 0, g: 6.5, fonte: "taco-app", tacoNome: "Contra-filé (cru)" },
  alface: { nome: "Alface americana", kcal: 14, p: 1.4, c: 2.4, g: 0.2, fonte: "taco-app", tacoNome: "Alface americana" },
  cebola: { nome: "Cebola", kcal: 40, p: 1.1, c: 9.3, g: 0.1, fonte: "taco-app", tacoNome: "Cebola (crua)" },
  ovo: { nome: "Ovo inteiro cru", kcal: 143, p: 13, c: 1.6, g: 9.5, fonte: "taco-app", tacoNome: "Ovo de galinha inteiro (cru)" },
  aveia: { nome: "Aveia em flocos", kcal: 394, p: 13.9, c: 66.6, g: 8.5, fonte: "taco-app", tacoNome: "Aveia em flocos", contem: ["gluten"] },
  cocoRalado: { nome: "Coco ralado sem açúcar", kcal: 650, p: 6, c: 20, g: 60, fonte: "taco-app", tacoNome: "Coco ralado (seco s/ açúcar)" },
  leiteCondensado: { nome: "Leite condensado", kcal: 313, p: 7.7, c: 57, g: 6.7, fonte: "taco-online", contem: ["lactose"] },
  doceDeLeite: { nome: "Doce de leite cremoso", kcal: 306, p: 5.5, c: 59.5, g: 6, fonte: "taco-online", contem: ["lactose"] },
  doceDeLeiteZero: { nome: "Doce de leite zero açúcar", kcal: 177, p: 6.6, c: 33, g: 2.1, fonte: "rotulo", contem: ["lactose"] },
  goiabadaCascao: { nome: "Goiabada cascão (tablete)", kcal: 333, p: 0, c: 83, g: 0, fonte: "rotulo" },
  goiabadaZero: { nome: "Goiabada zero açúcar", kcal: 146, p: 0.6, c: 60, g: 0.2, fonte: "rotulo" },
  doceBananaZero: { nome: "Doce de banana zero açúcar", kcal: 213, p: 2.6, c: 55, g: 0.5, fonte: "rotulo" },
  doceAbobora: { nome: "Doce de abóbora cremoso", kcal: 199, p: 0.9, c: 54.6, g: 0.2, fonte: "taco-online" },
  doceBatata: { nome: "Doce de batata-doce", kcal: 227, p: 0, c: 59, g: 0, fonte: "rotulo" },
  doceMocoto: { nome: "Doce (geleia) de mocotó", kcal: 120, p: 3, c: 28, g: 0, fonte: "taco-online" },
  pessegoCalda: { nome: "Pêssego em calda", kcal: 63, p: 0.7, c: 16.9, g: 0, fonte: "taco-online" },
  geleia: { nome: "Geleia de frutas", kcal: 278, p: 0.4, c: 68.9, g: 0.1, fonte: "taco-online" },
  geleiaLight: { nome: "Geleia de frutas light", kcal: 179, p: 0.4, c: 46.1, g: 0.1, fonte: "taco-online" },
  ameixaSeca: { nome: "Ameixa seca sem caroço", kcal: 240, p: 2.2, c: 63.9, g: 0.4, fonte: "taco-online" },
  tamara: { nome: "Tâmara seca", kcal: 282, p: 2.5, c: 75, g: 0.4, fonte: "rotulo" },
  cacauPo: { nome: "Cacau 100% em pó", kcal: 229, p: 19.6, c: 54.3, g: 13.7, fonte: "rotulo" },
  biscoitoArroz: { nome: "Biscoito de arroz", kcal: 365, p: 7.5, c: 77, g: 3, fonte: "rotulo" },
  gelatinaZero: { nome: "Gelatina zero pronta", kcal: 8, p: 1.8, c: 0.2, g: 0, fonte: "rotulo" },
  milhoPipoca: { nome: "Milho de pipoca (grão cru)", kcal: 375, p: 12.9, c: 74.3, g: 4.3, fonte: "rotulo" },
  suspiro: { nome: "Suspiro", kcal: 358, p: 6.2, c: 85.9, g: 0.1, fonte: "taco-online" },
  maionaseLight: { nome: "Maionese light", kcal: 240, p: 0.4, c: 12, g: 22, fonte: "rotulo" },
  paoHamburguer: { nome: "Pão de hambúrguer (Pullman)", kcal: 276, p: 8.3, c: 56, g: 2.4, fonte: "rotulo", contem: ["gluten"] },
  chocolateAoLeite: { nome: "Chocolate ao leite", kcal: 540, p: 7.2, c: 59.6, g: 30.3, fonte: "taco-online", contem: ["lactose"] },
  chocolate70: { nome: "Chocolate 70% cacau", kcal: 547, p: 10, c: 39, g: 36, fonte: "rotulo", contem: ["lactose", "gluten"] },
  snickers: { nome: "Snickers (barra de 45 g)", kcal: 482, p: 8.9, c: 60, g: 22.2, fonte: "rotulo", contem: ["lactose", "amendoim"] },
  miniChocolate: { nome: "Mini chocolate recheado (Snickers Mini)", kcal: 472, p: 8.3, c: 61.1, g: 22.2, fonte: "rotulo", contem: ["lactose", "amendoim"] },
  bombom: { nome: "Bombom Sonho de Valsa / Ouro Branco", kcal: 488, p: 5.6, c: 60.5, g: 29.3, fonte: "rotulo", contem: ["lactose", "amendoim", "gluten"] },
  pacocaZero: { nome: "Paçoca rolha zero açúcar", kcal: 472, p: 22.2, c: 30.6, g: 33.3, fonte: "rotulo", contem: ["amendoim"] },
  barraProteina: { nome: "Barrinha de proteína (33 g)", kcal: 373, p: 30.3, c: 28.8, g: 15.2, fonte: "rotulo", contem: ["lactose"] },
  sobremesaProteica: { nome: "Sobremesa proteica pronta (tipo YoPRO)", kcal: 72, p: 10, c: 6.1, g: 0.87, fonte: "rotulo", contem: ["lactose"] },
  picoleFrutasVermZero: { nome: "Picolé frutas vermelhas zero", kcal: 93, p: 2, c: 20, g: 0, fonte: "rotulo" },
  picoleUva: { nome: "Picolé de uva", kcal: 102, p: 0, c: 25, g: 0, fonte: "rotulo" },
  picoleLimao: { nome: "Picolé de limão", kcal: 111, p: 0, c: 28, g: 0, fonte: "rotulo" },
} satisfies Record<string, Ingrediente>;

export type IngredienteId = keyof typeof defs;
export const INGREDIENTES: Record<IngredienteId, Ingrediente> = defs;

export interface LinhaIngrediente {
  id: IngredienteId;
  gramas: number;
  unidade?: "g" | "ml";
  /** medida caseira equivalente (só para leitura) */
  medida?: string;
}

export interface Opcao {
  rotulo: string;
  ingredientes: LinhaIngrediente[];
}

interface CravingBase {
  id: string;
  titulo: string;
  icone: string;
  grupo: Grupo;
  categoria: Categoria;
  resumo: string;
  /** use `ingredientes` OU `opcoes` (2 ou mais; a primeira é a padrão) */
  ingredientes?: LinhaIngrediente[];
  opcoes?: Opcao[];
  /** o que não tem kcal relevante (água, gelo, temperos, molhos de baixa kcal) */
  extras?: string[];
  preparo: string[];
  tempo: string;
  dica?: string;
}

export interface Macros {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export interface Craving {
  id: string;
  titulo: string;
  icone: string;
  grupo: Grupo;
  categoria: Categoria;
  resumo: string;
  opcoes: Opcao[];
  extras?: string[];
  preparo: string[];
  tempo: string;
  dica?: string;
  /** um por opção */
  macros: Macros[];
  kcalMin: number;
  kcalMax: number;
  contem: Flag[];
  porcaoFixa: boolean;
}

const arred1 = (n: number) => Math.round(n * 10) / 10;

export function calcularMacros(linhas: LinhaIngrediente[]): Macros {
  const t = linhas.reduce(
    (acc, { id, gramas }) => {
      const ing = INGREDIENTES[id];
      const f = gramas / 100;
      return { kcal: acc.kcal + ing.kcal * f, p: acc.p + ing.p * f, c: acc.c + ing.c * f, g: acc.g + ing.g * f };
    },
    { kcal: 0, p: 0, c: 0, g: 0 },
  );
  return { kcal: Math.round(t.kcal), p: arred1(t.p), c: arred1(t.c), g: arred1(t.g) };
}

const BASE: CravingBase[] = [
  // ───────── NATURAIS ─────────
  {
    id: "cha-mel",
    icone: "🍵",
    titulo: "Chá Quente com Mel",
    grupo: "natural",
    categoria: "quentinho",
    resumo: "O mais leve da lista. Ótimo à noite.",
    ingredientes: [
      { id: "mel", gramas: 7, medida: "1 colher de chá" },
    ],
    extras: ["1 xícara (250 ml) de chá: camomila, erva-doce ou o da sua preferência"],
    preparo: [
      "Prepare o chá e deixe abafado por 5 minutos.",
      "Adoce com o mel.",
    ],
    tempo: "7 min",
  },
  {
    id: "palitos-pepino-cenoura",
    icone: "🥕",
    titulo: "Palitos de Pepino e Cenoura",
    grupo: "natural",
    categoria: "crocante",
    resumo: "Muita mastigação e quase nenhuma caloria.",
    ingredientes: [
      { id: "pepino", gramas: 100, medida: "meio pepino" },
      { id: "cenoura", gramas: 100, medida: "1 cenoura pequena" },
    ],
    extras: ["Limão, sal e páprica a gosto"],
    preparo: [
      "Corte o pepino e a cenoura em palitos.",
      "Esprema limão e tempere com sal e páprica. Se quiser, deixe gelar antes.",
    ],
    tempo: "5 min",
  },
  {
    id: "doce-banana-zero",
    icone: "🍌",
    titulo: "Doce de Banana Zero",
    grupo: "natural",
    categoria: "doce",
    resumo: "Bananinha zero açúcar, em porção medida de 30 g.",
    ingredientes: [
      { id: "doceBananaZero", gramas: 30, medida: "1 pedaço pequeno" },
    ],
    preparo: [
      "Separe 30 g de doce de banana zero açúcar.",
      "Coma devagar e guarde o resto.",
    ],
    tempo: "1 min",
    dica: "Escolha uma marca sem açúcar adicionado: a kcal varia de ~210 a ~260 por 100 g.",
  },
  {
    id: "cafe-leite-mel",
    icone: "☕",
    titulo: "Café com Leite e Mel",
    grupo: "natural",
    categoria: "quentinho",
    resumo: "Conforto rápido, com leite desnatado e só 1 colher de chá de mel.",
    ingredientes: [
      { id: "leiteDesnatado", gramas: 120, unidade: "ml", medida: "meia xícara" },
      { id: "mel", gramas: 7, medida: "1 colher de chá" },
    ],
    extras: ["Café sem açúcar a gosto"],
    preparo: [
      "Prepare o café e aqueça o leite.",
      "Misture, adoce com o mel e tome quente.",
    ],
    tempo: "3 min",
    dica: "Leite desnatado sem lactose funciona igual.",
  },
  {
    id: "uva-congelada",
    icone: "🍇",
    titulo: "Uva Congelada",
    grupo: "natural",
    categoria: "gelado",
    resumo: "Viram balinhas geladas e doces, com textura de sorbet. Demora para comer.",
    ingredientes: [
      { id: "uva", gramas: 100, medida: "1 cacho pequeno" },
    ],
    preparo: [
      "Lave, seque bem e separe as uvas do cacho (de preferência sem semente).",
      "Congele por pelo menos 3 horas e coma direto do freezer.",
    ],
    tempo: "2 min + congelar",
  },
  {
    id: "picole-caseiro",
    icone: "🍧",
    titulo: "Picolé Caseiro de Fruta",
    grupo: "natural",
    categoria: "gelado",
    resumo: "Picolé de fruta batida: escolha entre três frutas leves.",
    opcoes: [
      {
        rotulo: "Melancia",
        ingredientes: [
          { id: "melancia", gramas: 150, medida: "cerca de 1 fatia grande" },
        ],
      },
      {
        rotulo: "Morango",
        ingredientes: [
          { id: "morango", gramas: 150, medida: "cerca de 1 xícara" },
        ],
      },
      {
        rotulo: "Abacaxi com hortelã",
        ingredientes: [
          { id: "abacaxi", gramas: 150, medida: "2 fatias médias" },
        ],
      },
    ],
    extras: ["50 ml de água", "Hortelã a gosto (opcional)"],
    preparo: [
      "Bata a fruta escolhida com a água.",
      "Distribua em forminhas de picolé e congele por 4 horas.",
    ],
    tempo: "5 min + congelar",
    dica: "Melancia e morango são as mais leves (cerca de 45 kcal). O abacaxi fica em ~70.",
  },
  {
    id: "maca-assada",
    icone: "🍎",
    titulo: "Maçã Assada com Canela",
    grupo: "natural",
    categoria: "quentinho",
    resumo: "Quentinha e perfumada, com gosto de torta de maçã.",
    ingredientes: [
      { id: "macaFuji", gramas: 130, medida: "1 maçã média, com casca" },
    ],
    extras: ["Bastante canela"],
    preparo: [
      "Corte a maçã em fatias ou cubos e polvilhe bastante canela.",
      "Leve ao micro-ondas por 2 a 3 minutos (ou à airfryer a 180 °C por 10 minutos).",
    ],
    tempo: "4 min",
    dica: "Quer mais doce? 1 colher de chá de mel soma cerca de 22 kcal.",
  },
  {
    id: "ameixa-seca",
    icone: "🍑",
    titulo: "Ameixa Seca",
    grupo: "natural",
    categoria: "doce",
    resumo: "Doce, macia e fácil de porcionar.",
    ingredientes: [
      { id: "ameixaSeca", gramas: 35, medida: "4 ameixas sem caroço" },
    ],
    preparo: [
      "Separe 4 ameixas secas sem caroço (cerca de 35 g).",
      "Coma com calma, com um copo d’água.",
    ],
    tempo: "1 min",
    dica: "Em excesso, ameixa seca solta o intestino: fique nas 4 unidades.",
  },
  {
    id: "tamaras",
    icone: "🌴",
    titulo: "Tâmaras",
    grupo: "natural",
    categoria: "doce",
    resumo: "Doce natural e mastigável: em porção pequena já resolve.",
    ingredientes: [
      { id: "tamara", gramas: 30, medida: "3 tâmaras secas pequenas" },
    ],
    preparo: [
      "Separe 3 tâmaras pequenas (cerca de 30 g) e tire os caroços.",
      "Mastigue devagar e guarde o pacote.",
    ],
    tempo: "1 min",
    dica: "Compre sem calda. Tâmara Medjool (grande) pesa cerca de 24 g cada: confira na balança.",
  },
  {
    id: "chocolate-quente-fit",
    icone: "🥛",
    titulo: "Chocolate Quente Fit",
    grupo: "natural",
    categoria: "chocolate",
    resumo: "Cacau de verdade com leite desnatado e mel: aquece e mata a vontade de chocolate.",
    ingredientes: [
      { id: "leiteDesnatado", gramas: 150, unidade: "ml", medida: "cerca de 1 xícara" },
      { id: "cacauPo", gramas: 5, medida: "1 colher de sopa rasa" },
      { id: "mel", gramas: 7, medida: "1 colher de chá" },
    ],
    preparo: [
      "Dissolva o cacau em um pouco do leite frio, mexendo bem.",
      "Junte o restante do leite e aqueça (fogo baixo ou 1 min e 30 s no micro-ondas).",
      "Adoce com o mel e mexa de novo.",
    ],
    tempo: "4 min",
    dica: "Leite desnatado sem lactose funciona igual.",
  },
  {
    id: "abacaxi-grelhado",
    icone: "🍍",
    titulo: "Abacaxi Grelhado com Canela",
    grupo: "natural",
    categoria: "quentinho",
    resumo: "Dourado na frigideira: carameliza o açúcar natural da fruta.",
    ingredientes: [
      { id: "abacaxi", gramas: 180, medida: "2 fatias grandes" },
    ],
    extras: ["Canela a gosto"],
    preparo: [
      "Doure as fatias em frigideira antiaderente seca, 2 a 3 minutos de cada lado.",
      "Polvilhe canela e sirva morno.",
    ],
    tempo: "5 min",
  },
  {
    id: "melancia-gelada",
    icone: "🍉",
    titulo: "Melancia Gelada",
    grupo: "natural",
    categoria: "gelado",
    resumo: "Muito volume e pouca caloria: boa para quando a vontade é de beliscar.",
    ingredientes: [
      { id: "melancia", gramas: 300, medida: "cerca de 2 fatias médias" },
    ],
    extras: ["Limão e uma pitada de sal"],
    preparo: [
      "Deixe a melancia na geladeira por 2 horas (ou use cubos congelados por 30 minutos).",
      "Corte em cubos, esprema umas gotas de limão e finalize com uma pitada de sal.",
    ],
    tempo: "2 min",
  },
  {
    id: "banana-quente-cacau",
    icone: "🔥",
    titulo: "Banana Quente com Cacau e Canela",
    grupo: "natural",
    categoria: "chocolate",
    resumo: "Banana aquecida com cacau: parece sobremesa de chocolate.",
    ingredientes: [
      { id: "bananaPrata", gramas: 90, medida: "1 banana prata" },
      { id: "cacauPo", gramas: 5, medida: "1 colher de sopa rasa" },
    ],
    extras: ["Canela a gosto"],
    preparo: [
      "Amasse levemente a banana com o cacau e a canela.",
      "Aqueça 1 minuto no micro-ondas.",
    ],
    tempo: "2 min",
  },
  {
    id: "batata-airfryer",
    icone: "🍟",
    titulo: "Batata Crocante na Airfryer",
    grupo: "natural",
    categoria: "crocante",
    resumo: "Palitinhos crocantes, assados sem óleo.",
    ingredientes: [
      { id: "batata", gramas: 150, medida: "1 batata média, crua" },
    ],
    extras: ["Sal, páprica defumada e alho em pó a gosto"],
    preparo: [
      "Corte em palitos finos e seque bem com papel toalha.",
      "Tempere e leve à airfryer a 200 °C por 15 a 18 minutos, balançando a cesta na metade.",
      "Sirva na hora, ainda crocante.",
    ],
    tempo: "20 min",
    dica: "Quer mais crocância? Use no máximo 1 borrifada de óleo em spray.",
  },
  {
    id: "mousse-banana-cacau",
    icone: "🥣",
    titulo: "Mousse de Banana com Cacau",
    grupo: "natural",
    categoria: "chocolate",
    resumo: "Creme de chocolate só com banana e cacau, sem açúcar adicionado.",
    ingredientes: [
      { id: "bananaPrata", gramas: 100, medida: "1 banana média, sem casca" },
      { id: "cacauPo", gramas: 5, medida: "1 colher de sopa rasa" },
    ],
    extras: ["Canela a gosto"],
    preparo: [
      "Amasse a banana com um garfo até virar um creme.",
      "Misture o cacau e a canela até ficar homogêneo.",
      "Se der tempo, leve à geladeira por 15 minutos.",
    ],
    tempo: "5 min",
    dica: "Quanto mais madura a banana, mais doce fica o creme.",
  },
  {
    id: "sorvete-banana-morango",
    icone: "🍨",
    titulo: "Sorvete de Banana e Morango",
    grupo: "natural",
    categoria: "gelado",
    resumo: "Sorvete cremoso só com fruta congelada.",
    ingredientes: [
      { id: "bananaPrata", gramas: 100, medida: "1 banana média, congelada em rodelas" },
      { id: "morango", gramas: 50, medida: "congelado" },
    ],
    preparo: [
      "Congele a banana em rodelas e os morangos por pelo menos 4 horas.",
      "Bata no processador no modo pulsar, raspando as laterais, até virar um creme.",
      "Sirva na hora.",
    ],
    tempo: "5 min + congelar",
    dica: "Deixe porções de fruta congelada prontas no freezer: na hora da vontade é só bater.",
  },
  {
    id: "morango-leite-moca",
    icone: "🍓",
    titulo: "Morango com Leite Moça",
    grupo: "natural",
    categoria: "doce",
    resumo: "Fresquinho e doce, com a calda de leite condensado medida.",
    ingredientes: [
      { id: "morango", gramas: 150, medida: "cerca de 1 xícara, picado" },
      { id: "leiteCondensado", gramas: 20, medida: "1 colher de sopa rasa" },
    ],
    preparo: [
      "Lave e pique os morangos.",
      "Regue com o leite condensado medido e misture.",
    ],
    tempo: "3 min",
    dica: "Meça o leite condensado e feche a lata antes de começar a comer.",
  },
  {
    id: "queijo-goiabada-zero",
    icone: "🧀",
    titulo: "Queijo com Goiabada Zero",
    grupo: "natural",
    categoria: "doce",
    resumo: "Queijo minas com goiabada zero açúcar: salgado e doce juntos.",
    ingredientes: [
      { id: "minasFrescal", gramas: 30, medida: "1 fatia pequena" },
      { id: "goiabadaZero", gramas: 20, medida: "1 fatia fina" },
    ],
    preparo: [
      "Corte o queijo e a goiabada em fatias finas.",
      "Monte pequenos sanduíches de queijo com goiabada.",
    ],
    tempo: "2 min",
    dica: "Queijo minas light reduz cerca de 25 kcal. A kcal da goiabada zero varia de ~145 a ~235 por 100 g entre as marcas.",
  },
  {
    id: "pipoca-agua",
    icone: "🍿",
    titulo: "Pipoca de Milho na Água",
    grupo: "natural",
    categoria: "crocante",
    resumo: "Milho de pipoca estourado na água: sem óleo e sem micro-ondas.",
    opcoes: [
      {
        rotulo: "30 g de milho",
        ingredientes: [
          { id: "milhoPipoca", gramas: 30, medida: "cerca de 2 colheres de sopa cheias" },
        ],
      },
      {
        rotulo: "40 g de milho",
        ingredientes: [
          { id: "milhoPipoca", gramas: 40 },
        ],
      },
      {
        rotulo: "50 g de milho",
        ingredientes: [
          { id: "milhoPipoca", gramas: 50 },
        ],
      },
    ],
    extras: ["2 colheres de sopa de água", "Sal, páprica ou limão a gosto"],
    preparo: [
      "Coloque o milho e a água numa panela tampada, em fogo médio.",
      "Quando os estouros diminuírem, desligue e espere parar antes de abrir.",
      "Tempere com sal, páprica ou limão. Nada de manteiga, óleo ou pipoca de micro-ondas.",
    ],
    tempo: "10 min",
    dica: "Separe a porção antes de estourar e não faça uma segunda leva: pipoca é fácil de repetir sem perceber.",
  },
  {
    id: "iogurte-gelado-morango",
    icone: "🍦",
    titulo: "Iogurte Gelado com Morango",
    grupo: "natural",
    categoria: "gelado",
    resumo: "Um frozen yogurt caseiro, com pouquíssima gordura.",
    ingredientes: [
      { id: "iogurteDesnatado", gramas: 170, medida: "1 pote" },
      { id: "morango", gramas: 100, medida: "picado" },
      { id: "mel", gramas: 7, medida: "1 colher de chá" },
    ],
    extras: ["Canela a gosto"],
    preparo: [
      "Misture o iogurte, o mel e os morangos picados.",
      "Leve ao freezer por 40 minutos, mexendo na metade do tempo.",
      "Mexa de novo e sirva.",
    ],
    tempo: "5 min + freezer",
    dica: "Use iogurte natural desnatado SEM açúcar. O de sabor já vem adoçado e muda a conta.",
  },
  // ───────── CASEIROS E TRADICIONAIS ─────────
  {
    id: "doce-leite-zero",
    icone: "🥄",
    titulo: "Doce de Leite Zero",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "Zero açúcar e, de preferência, sem amido: confira o rótulo.",
    ingredientes: [
      { id: "doceDeLeiteZero", gramas: 30, medida: "1 colher de sopa cheia" },
    ],
    preparo: [
      "Coloque 30 g numa colher ou pires.",
      "Guarde o pote antes de comer e saboreie devagar.",
    ],
    tempo: "1 min",
    dica: "A kcal varia muito entre marcas (de ~145 a ~285 por 100 g). Prefira a que não leva amido na lista de ingredientes.",
  },
  {
    id: "pessego-calda",
    icone: "🥫",
    titulo: "Pêssego em Calda",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "2 metades de pêssego com um fio de calda.",
    ingredientes: [
      { id: "pessegoCalda", gramas: 100, medida: "2 metades, com um fio de calda" },
    ],
    preparo: [
      "Escorra o pêssego e separe 2 metades (cerca de 100 g, com um fio de calda).",
      "Se quiser, gele antes.",
    ],
    tempo: "1 min",
  },
  {
    id: "doce-abobora",
    icone: "🎃",
    titulo: "Doce de Abóbora",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "Pedaço de doce de abóbora, tipo de bar, em porção de 40 g.",
    ingredientes: [
      { id: "doceAbobora", gramas: 40, medida: "1 pedaço pequeno" },
    ],
    preparo: [
      "Separe um pedaço de 40 g.",
      "Coma devagar e guarde o resto.",
    ],
    tempo: "1 min",
  },
  {
    id: "doce-batata",
    icone: "🍠",
    titulo: "Doce de Batata",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "Doce de batata-doce em pedaço, tipo o de abóbora de bar.",
    ingredientes: [
      { id: "doceBatata", gramas: 40, medida: "1 pedaço pequeno" },
    ],
    preparo: [
      "Separe um pedaço de 40 g.",
      "Coma devagar e guarde o resto.",
    ],
    tempo: "1 min",
    dica: "Referência de rótulo: 1 unidade de 22 g tem cerca de 50 kcal.",
  },
  {
    id: "goiabada-cascao",
    icone: "🍬",
    titulo: "Goiabada Cascão",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "Doce denso de fruta, que dissolve devagar na boca.",
    ingredientes: [
      { id: "goiabadaCascao", gramas: 30, medida: "1 fatia do tamanho de uma caixa de fósforo" },
    ],
    preparo: [
      "Corte uma fatia de 30 g.",
      "Se quiser, aqueça 10 segundos no micro-ondas para amolecer.",
    ],
    tempo: "1 min",
    dica: "Valor de goiabada em tablete. A versão zero está em Queijo com Goiabada Zero.",
  },
  {
    id: "pao-integral-doce-leite",
    icone: "🍞",
    titulo: "Pão Integral com Doce de Leite Zero",
    grupo: "caseiro",
    categoria: "quentinho",
    resumo: "Pão integral com doce de leite zero, banana e morango, dourado na airfryer.",
    opcoes: [
      {
        rotulo: "1 fatia (25 g)",
        ingredientes: [
          { id: "paoIntegral", gramas: 25, medida: "1 fatia" },
          { id: "doceDeLeiteZero", gramas: 10, medida: "1 colher de sobremesa" },
          { id: "bananaPrata", gramas: 30, medida: "fatiada" },
          { id: "morango", gramas: 15, medida: "fatiado" },
        ],
      },
      {
        rotulo: "Versão leve (meia fatia)",
        ingredientes: [
          { id: "paoIntegral", gramas: 12.5, medida: "meia fatia" },
          { id: "doceDeLeiteZero", gramas: 5, medida: "1 colher de chá" },
          { id: "bananaPrata", gramas: 20, medida: "fatiada" },
          { id: "morango", gramas: 10, medida: "fatiado" },
        ],
      },
    ],
    extras: ["Canela a gosto"],
    preparo: [
      "Espalhe o doce de leite zero no pão.",
      "Cubra com a banana e o morango fatiados e polvilhe canela.",
      "Leve à airfryer a 180 °C por 3 a 5 minutos.",
    ],
    tempo: "8 min",
    dica: "A versão leve fica em cerca de 60 kcal.",
  },
  {
    id: "brigadeiro-proteico",
    icone: "🍫",
    titulo: "Brigadeiro de Colher Proteico",
    grupo: "caseiro",
    categoria: "chocolate",
    resumo: "Brigadeiro de colher com leite em pó desnatado e cacau 100%.",
    ingredientes: [
      { id: "leitePoDesnatado", gramas: 25, medida: "cerca de 2 colheres de sopa" },
      { id: "cacauPo", gramas: 10, medida: "2 colheres de sopa rasas" },
    ],
    extras: ["Adoçante a gosto", "Água quente até dar ponto"],
    preparo: [
      "Misture o leite em pó, o cacau e o adoçante.",
      "Junte água quente aos poucos, mexendo, até firmar.",
      "Coma de colher, na hora ou gelado.",
    ],
    tempo: "3 min",
  },
  {
    id: "doce-mocoto",
    icone: "🍮",
    titulo: "Doce de Mocotó",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "Geleia de mocotó: doce de colher, sem gordura.",
    ingredientes: [
      { id: "doceMocoto", gramas: 100, medida: "1 copinho" },
    ],
    preparo: [
      "Separe 1 copinho (100 g).",
      "Coma de colher, gelado.",
    ],
    tempo: "1 min",
  },
  {
    id: "tapioca-geleia",
    icone: "🥞",
    titulo: "Tapioca Doce com Geleia",
    grupo: "caseiro",
    categoria: "quentinho",
    resumo: "Massinha quentinha com recheio de geleia, sem gordura.",
    ingredientes: [
      { id: "tapiocaGoma", gramas: 60, medida: "1 tapioca média" },
      { id: "geleia", gramas: 15, medida: "1 colher de sopa rasa" },
    ],
    preparo: [
      "Espalhe a goma hidratada numa frigideira antiaderente seca, em fogo médio.",
      "Quando firmar (1 a 2 minutos), vire e deixe mais 1 minuto.",
      "Recheie com a geleia, dobre e coma quente.",
    ],
    tempo: "5 min",
    dica: "Frigideira antiaderente e seca: sem óleo e sem manteiga.",
  },
  {
    id: "morango-chocolate-70",
    icone: "🍓",
    titulo: "Morango com Chocolate 70%",
    grupo: "caseiro",
    categoria: "chocolate",
    resumo: "Muito volume de fruta com um banho de chocolate: parece sobremesa de restaurante.",
    ingredientes: [
      { id: "morango", gramas: 150, medida: "8 a 10 morangos" },
      { id: "chocolate70", gramas: 15, medida: "cerca de 2 quadradinhos" },
    ],
    preparo: [
      "Lave e seque bem os morangos (a água faz o chocolate escorregar).",
      "Derreta o chocolate no micro-ondas (20 segundos, mexendo) e mergulhe metade de cada morango.",
      "Leve à geladeira por 10 minutos para firmar.",
    ],
    tempo: "15 min",
    dica: "O chocolate firme na geladeira dá crocância e faz a porção render mais.",
  },
  {
    id: "torrada-tomate",
    icone: "🍅",
    titulo: "Torrada com Tomate e Orégano",
    grupo: "caseiro",
    categoria: "crocante",
    resumo: "Salgadinho crocante e sem gordura, bom para a vontade de salgado.",
    ingredientes: [
      { id: "paoForma", gramas: 50, medida: "2 fatias" },
      { id: "tomate", gramas: 60, medida: "3 a 4 fatias finas" },
    ],
    extras: ["Orégano e sal a gosto"],
    preparo: [
      "Toste o pão até ficar bem crocante.",
      "Cubra com o tomate fatiado, o orégano e uma pitada de sal.",
    ],
    tempo: "5 min",
    dica: "Esfregue um dente de alho na torrada quente para ganhar sabor.",
  },
  {
    id: "beijinho-coco",
    icone: "🥥",
    titulo: "Beijinho Fit de Coco",
    grupo: "caseiro",
    categoria: "doce",
    resumo: "Beijinho com leite em pó desnatado e coco ralado sem açúcar.",
    ingredientes: [
      { id: "leitePoDesnatado", gramas: 20, medida: "cerca de 1 colher de sopa e meia" },
      { id: "cocoRalado", gramas: 10, medida: "1 colher de sopa" },
    ],
    extras: ["Adoçante a gosto", "Água até dar ponto"],
    preparo: [
      "Misture o leite em pó, o coco e o adoçante.",
      "Junte água aos poucos até dar ponto de brigadeiro e leve à geladeira por 10 minutos.",
    ],
    tempo: "12 min",
    dica: "O coco é gordura: mantenha os 10 g.",
  },
  // ───────── INDUSTRIALIZADOS ─────────
  {
    id: "gelatina-zero",
    icone: "🧊",
    titulo: "Gelatina Zero",
    grupo: "industrializado",
    categoria: "gelado",
    resumo: "Quase sem kcal. Fica cremosa com 1 colher de sopa de leite em pó.",
    opcoes: [
      {
        rotulo: "Só a gelatina",
        ingredientes: [
          { id: "gelatinaZero", gramas: 120, medida: "1 taça pequena, já pronta" },
        ],
      },
      {
        rotulo: "Com leite em pó",
        ingredientes: [
          { id: "gelatinaZero", gramas: 120, medida: "1 taça pequena, já pronta" },
          { id: "leitePoDesnatado", gramas: 10, medida: "1 colher de sopa" },
        ],
      },
    ],
    preparo: [
      "Prepare a gelatina zero conforme a embalagem e leve à geladeira.",
      "Para ficar cremosa, bata a gelatina fria com 1 colher de sopa de leite em pó.",
    ],
    tempo: "5 min + gelar",
    dica: "Com leite em pó integral soma cerca de 50 kcal em vez de 35.",
  },
  {
    id: "picole-fruta",
    icone: "🍭",
    titulo: "Picolé de Fruta",
    grupo: "industrializado",
    categoria: "gelado",
    resumo: "Picolé pronto de fruta à base de água: escolha entre três sabores leves.",
    opcoes: [
      {
        rotulo: "Frutas vermelhas zero",
        ingredientes: [
          { id: "picoleFrutasVermZero", gramas: 60, medida: "1 unidade" },
        ],
      },
      {
        rotulo: "Uva",
        ingredientes: [
          { id: "picoleUva", gramas: 60, medida: "1 unidade" },
        ],
      },
      {
        rotulo: "Limão",
        ingredientes: [
          { id: "picoleLimao", gramas: 60, medida: "1 unidade" },
        ],
      },
    ],
    preparo: [
      "Escolha o picolé de fruta à base de água (não o cremoso, nem o de leite).",
      "Confira no rótulo: até 70 kcal por unidade.",
    ],
    tempo: "1 min",
    dica: "Picolés cremosos, de leite condensado ou de coco passam de 90 kcal: evite.",
  },
  {
    id: "pacoca-zero",
    icone: "🥜",
    titulo: "Paçoca Rolha Zero Açúcar",
    grupo: "industrializado",
    categoria: "doce",
    resumo: "1 unidade, sem açúcar adicionado.",
    ingredientes: [
      { id: "pacocaZero", gramas: 18, medida: "1 unidade" },
    ],
    preparo: [
      "Separe 1 unidade (18 g) e guarde o pacote.",
      "Coma devagar.",
    ],
    tempo: "1 min",
    dica: "Contém amendoim. Confira o rótulo da marca: a kcal varia entre as versões.",
  },
  {
    id: "bombom",
    icone: "🎁",
    titulo: "Bombom Sonho de Valsa ou Ouro Branco",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "1 bombom, sem abrir o segundo.",
    ingredientes: [
      { id: "bombom", gramas: 21.5, medida: "1 bombom" },
    ],
    preparo: [
      "Separe 1 bombom e guarde a caixa.",
      "Coma devagar, sem abrir o segundo.",
    ],
    tempo: "1 min",
    dica: "Contém amendoim e trigo. Confira o rótulo.",
  },
  {
    id: "suspiro",
    icone: "☁️",
    titulo: "Suspiro",
    grupo: "industrializado",
    categoria: "doce",
    resumo: "Escolha 30, 45 ou 60 g na balança.",
    opcoes: [
      {
        rotulo: "30 g",
        ingredientes: [
          { id: "suspiro", gramas: 30 },
        ],
      },
      {
        rotulo: "45 g",
        ingredientes: [
          { id: "suspiro", gramas: 45 },
        ],
      },
      {
        rotulo: "60 g",
        ingredientes: [
          { id: "suspiro", gramas: 60 },
        ],
      },
    ],
    preparo: [
      "Pese a porção na balança.",
      "Guarde o pacote antes de comer.",
    ],
    tempo: "1 min",
    dica: "Suspiro quase não pesa: 60 g são muitas unidades. Por isso a porção é em gramas.",
  },
  {
    id: "chocolate-ao-leite",
    icone: "🤎",
    titulo: "Chocolate ao Leite",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "O clássico cremoso e doce, só que em porção fixa.",
    ingredientes: [
      { id: "chocolateAoLeite", gramas: 20, medida: "cerca de 4 quadradinhos de tablete comum" },
    ],
    preparo: [
      "Separe 20 g e guarde o restante do tablete.",
      "Deixe derreter na boca antes de mastigar.",
    ],
    tempo: "1 min",
    dica: "O número de quadradinhos varia por marca: na primeira vez, confira o peso na balança.",
  },
  {
    id: "snickers-meia-barra",
    icone: "🍫",
    titulo: "Snickers (Meia Barra)",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "O Snickers de sempre, em uma porção que cabe no plano.",
    ingredientes: [
      { id: "snickers", gramas: 22.5, medida: "metade de uma barra de 45 g" },
    ],
    preparo: [
      "Corte a barra ao meio.",
      "Guarde a outra metade; congelada, ela fica dura e demora mais para comer.",
    ],
    tempo: "1 min",
    dica: "Confira o rótulo: pode conter traços de trigo, soja e outras oleaginosas.",
  },
  {
    id: "sobremesa-proteica",
    icone: "🍮",
    titulo: "Sobremesa Proteica Pronta",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "Pote pronto (tipo YoPRO) com cerca de 15 g de proteína.",
    ingredientes: [
      { id: "sobremesaProteica", gramas: 150, medida: "1 pote" },
    ],
    preparo: [
      "Escolha um pote com até 130 kcal e pelo menos 12 g de proteína (confira o rótulo).",
      "Gelado, rende mais.",
    ],
    tempo: "1 min",
    dica: "Valores de rótulo do YoPRO (Europa). Confira a marca vendida no Brasil.",
  },
  {
    id: "chocolate-70",
    icone: "⬛",
    titulo: "Chocolate 70% Cacau",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "Intenso e cremoso: poucos quadradinhos já resolvem.",
    ingredientes: [
      { id: "chocolate70", gramas: 20, medida: "2 a 3 quadradinhos, conforme a marca" },
    ],
    preparo: [
      "Pese 20 g (a porção do rótulo costuma ser de 25 g, que são 3 quadradinhos).",
      "Deixe derreter na boca, sem pressa, e guarde o resto da barra.",
    ],
    tempo: "1 min",
    dica: "Quer mais? 25 g (3 quadradinhos) ficam em cerca de 135 kcal.",
  },
  {
    id: "whey-chocolate-gelado",
    icone: "🥤",
    titulo: "Whey de Chocolate Gelado",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "Milkshake rápido de chocolate, com pouquíssima gordura e bastante proteína.",
    ingredientes: [
      { id: "wheyConcentrado", gramas: 30, medida: "1 dose, sabor chocolate" },
    ],
    extras: ["150 ml de água", "Gelo à vontade (4 a 5 pedras)"],
    preparo: [
      "Bata tudo no liquidificador por 30 segundos.",
      "Sirva na hora, bem gelado.",
    ],
    tempo: "2 min",
    dica: "Se usar whey isolado, a kcal cai cerca de 10 por dose.",
  },
  {
    id: "barrinha-proteina",
    icone: "💪",
    titulo: "Barrinha de Proteína",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "Sabor de chocolate com cerca de 10 g de proteína em ~120 kcal.",
    ingredientes: [
      { id: "barraProteina", gramas: 33, medida: "1 barrinha pequena, tipo Max Bar" },
    ],
    preparo: [
      "Escolha uma barrinha de 30 a 35 g (até 150 kcal no rótulo).",
      "Coma devagar, saboreando.",
    ],
    tempo: "1 min",
    dica: "Barras grandes de 40 a 60 g (15 a 20 g de proteína) costumam passar de 200 kcal: coma só metade.",
  },
  {
    id: "biscoito-arroz-geleia",
    icone: "🍘",
    titulo: "Biscoito de Arroz com Geleia",
    grupo: "industrializado",
    categoria: "crocante",
    resumo: "Crocância doce e bem leve.",
    ingredientes: [
      { id: "biscoitoArroz", gramas: 30, medida: "3 a 6 biscoitos, conforme a marca" },
      { id: "geleiaLight", gramas: 15, medida: "1 colher de sopa rasa" },
    ],
    preparo: [
      "Separe 30 g de biscoitos (a porção está no rótulo).",
      "Passe a geleia por cima e coma na hora, para não amolecer.",
    ],
    tempo: "2 min",
    dica: "Com geleia comum em vez de light, soma cerca de 15 kcal. Confira no rótulo se o biscoito é sem glúten.",
  },
  {
    id: "minis-chocolate",
    icone: "🍪",
    titulo: "Minis de Chocolate Recheado",
    grupo: "industrializado",
    categoria: "chocolate",
    resumo: "Snickers Mini, Trento Mini e similares: até 30 g.",
    ingredientes: [
      { id: "miniChocolate", gramas: 30, medida: "3 a 4 minis" },
    ],
    preparo: [
      "Separe até 30 g de minis (3 a 4 unidades) e guarde o pacote.",
      "Coma devagar.",
    ],
    tempo: "1 min",
    dica: "O Charge (barra de 40 g) tem cerca de 195 kcal: só vale meia barra. Confira o rótulo e escolha sabores sem recheio de oleaginosas.",
  },
  // ───────── TROCA DE REFEIÇÃO ─────────
  {
    id: "crepioca-doce",
    icone: "🥚",
    titulo: "Crepioca Doce de Chocolate e Morango",
    grupo: "troca",
    categoria: "chocolate",
    resumo: "Crepioca com recheio de chocolate e morango, no lugar de uma refeição.",
    ingredientes: [
      { id: "ovo", gramas: 50, medida: "1 ovo" },
      { id: "tapiocaGoma", gramas: 25, medida: "goma hidratada" },
      { id: "cacauPo", gramas: 5, medida: "na massa" },
      { id: "chocolateAoLeite", gramas: 20, medida: "no recheio" },
      { id: "morango", gramas: 50, medida: "no recheio" },
    ],
    preparo: [
      "Misture o ovo, a goma e o cacau.",
      "Despeje em frigideira antiaderente e doure dos dois lados.",
      "Recheie com o chocolate ao leite picado e o morango; dobre e coma quente.",
    ],
    tempo: "10 min",
    dica: "Se a goma for seca (fécula), some cerca de 55 kcal.",
  },
  {
    id: "panqueca-proteica",
    icone: "🥞",
    titulo: "Panqueca Americana Proteica",
    grupo: "troca",
    categoria: "quentinho",
    resumo: "Panqueca com whey e aveia, coberta com doce de leite, no lugar de uma refeição.",
    ingredientes: [
      { id: "ovo", gramas: 50, medida: "1 ovo" },
      { id: "aveia", gramas: 30, medida: "na massa" },
      { id: "wheyConcentrado", gramas: 20, medida: "na massa" },
      { id: "bananaPrata", gramas: 50, medida: "na massa" },
      { id: "doceDeLeite", gramas: 25, medida: "por cima" },
    ],
    preparo: [
      "Bata o ovo, a aveia, o whey e a banana.",
      "Doure em frigideira antiaderente, 2 a 3 minutos de cada lado.",
      "Cubra com o doce de leite.",
    ],
    tempo: "12 min",
  },
  {
    id: "bife-pao-frances",
    icone: "🥩",
    titulo: "Bife de Contrafilé com Pão Francês",
    grupo: "troca",
    categoria: "quentinho",
    resumo: "Bife grelhado no pão francês com mussarela, no lugar de uma refeição.",
    opcoes: [
      {
        rotulo: "Com maionese light",
        ingredientes: [
          { id: "contraFileCru", gramas: 150, medida: "1 bife, peso cru" },
          { id: "paoFrances", gramas: 50, medida: "1 pão" },
          { id: "mucarela", gramas: 20, medida: "1 fatia" },
          { id: "maionaseLight", gramas: 15, medida: "1 colher de sopa" },
        ],
      },
      {
        rotulo: "Com requeijão light",
        ingredientes: [
          { id: "contraFileCru", gramas: 150, medida: "1 bife, peso cru" },
          { id: "paoFrances", gramas: 50, medida: "1 pão" },
          { id: "mucarela", gramas: 20, medida: "1 fatia" },
          { id: "requeijaoLight", gramas: 20, medida: "1 colher de sopa" },
        ],
      },
    ],
    preparo: [
      "Grelhe o bife na frigideira antiaderente.",
      "Abra o pão, passe a maionese ou o requeijão light e monte com a mussarela e o bife.",
    ],
    tempo: "15 min",
    dica: "O peso do bife é cru: depois de grelhado fica com cerca de 105 g.",
  },
  {
    id: "hamburguer-artesanal",
    icone: "🍔",
    titulo: "Hambúrguer Artesanal",
    grupo: "troca",
    categoria: "quentinho",
    resumo: "180 g de patinho, mussarela, salada, molhos e pão de hambúrguer, no lugar de uma refeição.",
    opcoes: [
      {
        rotulo: "Sem maionese",
        ingredientes: [
          { id: "patinhoCru", gramas: 180, medida: "peso cru" },
          { id: "paoHamburguer", gramas: 50, medida: "1 pão" },
          { id: "mucarela", gramas: 20, medida: "1 fatia" },
          { id: "alface", gramas: 30, medida: "à vontade" },
          { id: "tomate", gramas: 40, medida: "à vontade" },
          { id: "cebola", gramas: 20, medida: "à vontade" },
        ],
      },
      {
        rotulo: "Com 1 colher de maionese light",
        ingredientes: [
          { id: "patinhoCru", gramas: 180, medida: "peso cru" },
          { id: "paoHamburguer", gramas: 50, medida: "1 pão" },
          { id: "mucarela", gramas: 20, medida: "1 fatia" },
          { id: "alface", gramas: 30, medida: "à vontade" },
          { id: "tomate", gramas: 40, medida: "à vontade" },
          { id: "cebola", gramas: 20, medida: "à vontade" },
          { id: "maionaseLight", gramas: 15, medida: "1 colher de sopa" },
        ],
      },
    ],
    extras: ["Molhos à vontade: mostarda, ketchup ou molho de tomate"],
    preparo: [
      "Tempere o patinho e modele o hambúrguer.",
      "Grelhe 4 minutos de cada lado e derreta a mussarela por cima.",
      "Toste o pão na chapa e monte com a salada e os molhos.",
    ],
    tempo: "25 min",
    dica: "Mostarda, ketchup e molho de tomate somam pouco. Maionese e molhos cremosos somam de 35 a 100 kcal por colher de sopa. O patinho é pesado cru: 180 g viram cerca de 125 g depois de pronto.",
  },
];

function flagsDe(opcoes: Opcao[]): Flag[] {
  const set = new Set<Flag>();
  for (const o of opcoes) for (const { id } of o.ingredientes) INGREDIENTES[id].contem?.forEach((f) => set.add(f));
  return [...set].sort();
}

function normalizar(b: CravingBase): Craving {
  const opcoes: Opcao[] = b.opcoes ?? [{ rotulo: "", ingredientes: b.ingredientes ?? [] }];
  const macros = opcoes.map((o) => calcularMacros(o.ingredientes));
  const kcals = macros.map((m) => m.kcal);
  return {
    id: b.id,
    titulo: b.titulo,
    icone: b.icone,
    grupo: b.grupo,
    categoria: b.categoria,
    resumo: b.resumo,
    opcoes,
    extras: b.extras,
    preparo: b.preparo,
    tempo: b.tempo,
    dica: b.dica,
    macros,
    kcalMin: Math.min(...kcals),
    kcalMax: Math.max(...kcals),
    contem: flagsDe(opcoes),
    porcaoFixa: b.grupo !== "troca" && macros[0].g > LIMITE_GORDURA_PADRAO_G,
  };
}

const ORDEM_GRUPO: Record<Grupo, number> = { natural: 0, caseiro: 1, industrializado: 2, troca: 3 };
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Já na ordem final: grupo, depois kcal crescente (da opção de menor kcal), desempate pelo título. */
export const CRAVINGS: Craving[] = BASE.map(normalizar).sort(
  (a, b) =>
    ORDEM_GRUPO[a.grupo] - ORDEM_GRUPO[b.grupo] ||
    a.kcalMin - b.kcalMin ||
    comparar(semAcento(a.titulo), semAcento(b.titulo)),
);
