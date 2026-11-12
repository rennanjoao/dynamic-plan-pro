/**
 * foodTwins.ts — Equivalência entre a base enriquecida (`ENRICHED_FOODS`, nomes com vírgula,
 * ex.: "Banana, prata, crua") e a base legada (`TACO_FOODS`, nomes com parênteses,
 * ex.: "Banana prata (crua)").
 *
 * POR QUE EXISTE
 * Os dois nomes são o MESMO alimento no MESMO estado, então a busca mostrava duas linhas
 * redundantes. A versão com parênteses é a preferida: traz peso por unidade (`unitWeight`) e
 * medidas caseiras (`portions`), então "2 uni", "1 fatia" etc. convertem em gramas com mais
 * precisão. A fibra continua sendo resolvida normalmente (`resolveFiberPer100`): cada par
 * abaixo foi conferido e nenhum perde dado de fibra ao trocar para o nome com parênteses.
 *
 * REGRAS PARA UM PAR ENTRAR AQUI (o teste foodSearch.test.ts confere):
 *  1. Mesmo alimento, mesmo estado (cru ↔ cru) e mesmo corte/variante.
 *  2. A energia dos dois difere no máximo max(8 kcal, 15%). Quando a fonte divergia mais que isso,
 *     o cadastro com parênteses foi ALINHADO À TACO (valores do item enriquecido), mantendo nome,
 *     unidades e porções: Lombo, Pernil e Bisteca suínos, Acém, Contra-filé, Alcatra, Coxão mole,
 *     Manga, Uva, Kiwi, Brócolis, Chuchu, Berinjela e Repolho. Assim a troca na busca nunca muda
 *     a prescrição por causa de fonte de dados diferente.
 *
 * REGRA DO CRU → COZIDO (vale para tudo aqui): o coach prescreve o CRU e as kcal ficam fixas; o
 * cozido só muda o PESO (cru × cookFactor), para o aluno pesar a marmita. Por isso os dois lados de
 * um par precisam ter o mesmo fator de cozimento (o teste confere).
 *
 * FICAM DE FORA (continuam aparecendo nos dois nomes, de propósito):
 *  - Frango sobrecoxa/coxa: o seletor "Versão do corte" depende dos nomes enriquecidos.
 *  - Itens sem equivalente exato (ex.: "Milho, verde, cru", "Tapioca, com manteiga").
 *
 * chave = nome enriquecido · valor = nome legado (com parênteses)
 */
export const ENRICHED_TO_LEGACY: Record<string, string> = {
  // Carboidratos
  "Arroz, integral, cru": "Arroz integral (cru)",
  "Arroz, tipo 1, cru": "Arroz branco (cru)",
  "Aveia, flocos, crua": "Aveia em flocos",
  "Macarrão, trigo, cru": "Macarrão de trigo comum (cru)",
  "Batata, doce, crua": "Batata doce (crua)",
  "Batata, inglesa, crua": "Batata inglesa (crua)",
  "Mandioca, crua": "Mandioca / Aipim (crua)",
  "Inhame, cru": "Inhame (cru)",
  "Feijão, carioca, cru": "Feijão carioca (cru)",
  "Feijão, preto, cru": "Feijão preto (cru)",
  "Lentilha, crua": "Lentilha (crua)",
  "Grão-de-bico, cru": "Grão-de-bico (cru)",
  "Pão, trigo, forma, integral": "Pão de forma integral",
  "Pão, trigo, francês": "Pão francês",

  // Proteínas
  "Frango, peito, sem pele, cru": "Frango peito s/ pele (cru)",
  "Ovo, de galinha, inteiro, cru": "Ovo de galinha inteiro (cru)",
  "Carne, bovina, patinho, sem gordura, cru": "Patinho (cru)",
  "Carne, bovina, acém, sem gordura, cru": "Acém (cru)",
  "Carne, bovina, contra-filé, sem gordura, cru": "Contra-filé (cru)",
  "Carne, bovina, coxão mole, sem gordura, cru": "Coxão mole (cru)",
  "Carne, bovina, miolo de alcatra, sem gordura, cru": "Alcatra (crua)",
  "Porco, lombo, cru": "Lombo suíno (cru)",
  "Porco, pernil, cru": "Pernil suíno s/ osso (cru)",
  "Porco, bisteca, crua": "Bisteca suína (crua)",
  "Carne, bovina, picanha, sem gordura, crua": "Picanha s/ gordura (crua)",
  "Carne, bovina, picanha, com gordura, crua": "Picanha c/ gordura (crua)",
  "Salmão, sem pele, fresco, cru": "Salmão s/ pele (cru)",
  "Atum, fresco, cru": "Atum fresco (cru)",
  "Atum, conserva em óleo": "Atum em lata (em óleo/drenado)",
  "Sardinha, inteira, crua": "Sardinha fresca (crua)",
  "Merluza, filé, cru": "Merluza / Pescada (crua)",

  // Vegetais
  "Brócolis, cru": "Brócolis (cru)",
  "Abobrinha, italiana, crua": "Abobrinha italiana (crua)",
  "Cenoura, crua": "Cenoura (crua)",
  "Tomate, com semente, cru": "Tomate salada",
  "Pepino, cru": "Pepino (cru com casca)",
  "Alface, crespa, crua": "Alface crespa",
  "Espinafre, Nova Zelândia, cru": "Espinafre (cru)",
  "Couve-flor, crua": "Couve-flor (crua)",
  "Chuchu, cru": "Chuchu (cru)",
  "Cebola, crua": "Cebola (crua)",
  "Berinjela, crua": "Berinjela (crua)",
  "Beterraba, crua": "Beterraba (crua)",
  "Repolho, branco, cru": "Repolho branco (cru)",
  "Pimentão, verde, cru": "Pimentão (cru)",
  "Abóbora, cabotian, crua": "Abóbora cabotian (crua)",

  // Frutas
  "Banana, prata, crua": "Banana prata (crua)",
  "Banana, nanica, crua": "Banana nanica (crua)",
  "Maçã, Fuji, com casca, crua": "Maçã fuji (com casca)",
  "Mamão, Papaia, cru": "Mamão papaia",
  "Laranja, pêra, crua": "Laranja pera",
  "Morango, cru": "Morango",
  "Melancia, crua": "Melancia",
  "Manga, Tommy Atkins, crua": "Manga palmer / tommy",
  "Uva, Itália, crua": "Uva itália / rubi",
  "Kiwi, cru": "Kiwi",
  "Abacate, cru": "Abacate (polpa)",
  "Pêra, Williams, crua": "Pera (com casca)",
  "Abacaxi, cru": "Abacaxi",
  "Goiaba, vermelha, com casca, crua": "Goiaba",

  // Laticínios, castanhas e gorduras
  "Queijo, minas, frescal": "Queijo Minas Frescal",
  "Castanha-do-Brasil, crua": "Castanha do Pará / Brasil",
  "Azeite, de oliva, extra virgem": "Azeite de oliva extra virgem",
};
