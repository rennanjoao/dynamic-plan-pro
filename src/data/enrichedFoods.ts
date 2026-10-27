/**
 * Catálogo curado de alimentos fundamentais, extraídos da planilha oficial TACO 4ª ed.
 * Valores publicados por 100 g de parte comestível; fibra obtida da coluna Fibra Alimentar.
 * Fonte: NEPA/UNICAMP, Taco-4a-Edicao.xlsx (TACO 4a edição), itens anotados individualmente.
 * Dados de marca (ex.: whey) não pertencem a esta tabela e devem vir do rótulo do fabricante.
 */
import type { TacoFood } from "./tacoFoods";

export const ENRICHED_FOODS: Array<TacoFood & { fiber: number }> = [
  { name: "Arroz, integral, cru", kcal: 359.678, p: 7.323, c: 77.451, g: 1.865, fiber: 4.819, group: "carb", cookFactor: 2.7 }, // TACO item 2
  { name: "Arroz, tipo 1, cru", kcal: 357.789, p: 7.159, c: 78.76, g: 0.335, fiber: 1.639, group: "carb", cookFactor: 2.7 }, // TACO item 4
  { name: "Aveia, flocos, crua", kcal: 393.823, p: 13.921, c: 66.636, g: 8.497, fiber: 9.13, group: "carb", cookFactor: 1 }, // TACO item 7
  { name: "Macarrão, trigo, cru", kcal: 371.123, p: 9.996, c: 77.944, g: 1.303, fiber: 2.927, group: "carb", cookFactor: 2.7 }, // TACO item 40
  { name: "Macarrão, trigo, cru, com ovos", kcal: 370.567, p: 10.321, c: 76.623, g: 1.97, fiber: 2.297, group: "carb", cookFactor: 2.7 }, // TACO item 41
  { name: "Farinha, de mandioca, torrada", kcal: 365.269, p: 1.229, c: 89.194, g: 0.287, fiber: 6.54, group: "carb", cookFactor: 0.85 }, // TACO item 122
  { name: "Farinha, de milho, amarela", kcal: 350.587, p: 7.188, c: 79.079, g: 1.467, fiber: 5.49, group: "carb", cookFactor: 1 }, // TACO item 33
  { name: "Milho, fubá, cru", kcal: 353.482, p: 7.214, c: 78.873, g: 1.903, fiber: 4.713, group: "carb", cookFactor: 1 }, // TACO item 43
  { name: "Batata, doce, crua", kcal: 118.241, p: 1.257, c: 28.196, g: 0.133, fiber: 2.573, group: "carb", cookFactor: 0.85 }, // TACO item 89
  { name: "Batata, inglesa, crua", kcal: 64.37, p: 1.772, c: 14.688, g: 0, fiber: 1.163, group: "carb", cookFactor: 0.85 }, // TACO item 92
  { name: "Mandioca, crua", kcal: 151.417, p: 1.13, c: 36.17, g: 0.3, fiber: 1.877, group: "carb", cookFactor: 0.85 }, // TACO item 130
  { name: "Inhame, cru", kcal: 96.7, p: 2.051, c: 23.233, g: 0.213, fiber: 1.653, group: "carb", cookFactor: 0.85 }, // TACO item 126
  { name: "Feijão, carioca, cru", kcal: 329.027, p: 19.982, c: 61.221, g: 1.257, fiber: 18.42, group: "carb", cookFactor: 2.7 }, // TACO item 562
  { name: "Feijão, preto, cru", kcal: 323.566, p: 21.344, c: 58.752, g: 1.24, fiber: 21.833, group: "carb", cookFactor: 2.7 }, // TACO item 568
  { name: "Lentilha, crua", kcal: 339.141, p: 23.152, c: 62.004, g: 0.77, fiber: 16.937, group: "carb", cookFactor: 2.7 }, // TACO item 578
  { name: "Grão-de-bico, cru", kcal: 354.703, p: 21.229, c: 57.884, g: 5.43, fiber: 12.357, group: "carb", cookFactor: 2.7 }, // TACO item 575
  { name: "Milho, verde, cru", kcal: 138.167, p: 6.59, c: 28.556, g: 0.609, fiber: 3.918, group: "carb", cookFactor: 1 }, // TACO item 44
  { name: "Milho, verde, enlatado, drenado", kcal: 97.565, p: 3.228, c: 17.135, g: 2.353, fiber: 4.643, group: "carb", cookFactor: 1 }, // TACO item 45
  { name: "Pão, trigo, forma, integral", kcal: 253.194, p: 9.425, c: 49.941, g: 3.653, fiber: 6.883, group: "carb", cookFactor: 1, portions: [{"label": "1 fatia", "grams": 25}] }, // TACO item 52
  { name: "Pão, trigo, francês", kcal: 299.81, p: 7.954, c: 58.646, g: 3.103, fiber: 2.307, group: "carb", cookFactor: 1 }, // TACO item 53
  { name: "Tapioca, com manteiga", kcal: 347.827, p: 0.09, c: 63.592, g: 10.908, fiber: 0, group: "carb", cookFactor: 1 }, // TACO item 551
  { name: "Pipoca, com óleo de soja, sem sal", kcal: 448.334, p: 9.927, c: 70.313, g: 15.941, fiber: 14.337, group: "carb", cookFactor: 1 }, // TACO item 61
  { name: "Frango, peito, sem pele, cru", kcal: 119.159, p: 21.527, c: 0.0, g: 3.02, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 409
  { name: "Frango, sobrecoxa, sem pele, crua", kcal: 161.796, p: 17.57, c: 0.0, g: 9.62, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 414
  { name: "Frango, coxa, sem pele, crua", kcal: 119.947, p: 17.813, c: 0.02, g: 4.857, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 399
  { name: "Frango, sobrecoxa, com pele, crua", kcal: 254.532, p: 15.46, c: 0.0, g: 20.9, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 412
  { name: "Ovo, de galinha, inteiro, cru", kcal: 143.112, p: 13.03, c: 1.637, g: 8.9, fiber: 0, group: "protein", cookFactor: 0.92, portions: [{"label": "1 unidade", "grams": 50}] }, // TACO item 489
  { name: "Carne, bovina, patinho, sem gordura, cru", kcal: 133.469, p: 21.723, c: 0.0, g: 4.513, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 376
  { name: "Carne, bovina, acém, sem gordura, cru", kcal: 144.029, p: 20.817, c: 0.0, g: 6.113, fiber: 0, group: "protein", cookFactor: 0.65 }, // TACO item 329
  { name: "Carne, bovina, contra-filé, sem gordura, cru", kcal: 156.616, p: 23.997, c: 0.0, g: 6.003, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 345
  { name: "Carne, bovina, picanha, sem gordura, crua", kcal: 133.522, p: 21.25, c: 0.0, g: 4.743, fiber: 0, group: "protein", cookFactor: 0.68 }, // TACO item 382
  { name: "Carne, bovina, picanha, com gordura, crua", kcal: 212.879, p: 18.823, c: 0.0, g: 14.69, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 380
  { name: "Porco, lombo, cru", kcal: 175.625, p: 22.604, c: 0.0, g: 8.77, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 433
  { name: "Porco, pernil, cru", kcal: 186.056, p: 20.125, c: 0.0, g: 11.1, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 436
  { name: "Porco, bisteca, crua", kcal: 164.115, p: 21.5, c: 0.0, g: 8.017, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 427
  { name: "Salmão, sem pele, fresco, cru", kcal: 169.782, p: 19.252, c: 0.0, g: 9.709, fiber: 0, group: "protein", cookFactor: 0.75 }, // TACO item 316
  { name: "Atum, fresco, cru", kcal: 117.501, p: 25.68, c: 0.0, g: 0.87, fiber: 0, group: "protein", cookFactor: 0.75 }, // TACO item 278
  { name: "Atum, conserva em óleo", kcal: 165.911, p: 26.188, c: 0.0, g: 5.997, fiber: 0, group: "protein", cookFactor: 1 }, // TACO item 277
  { name: "Sardinha, inteira, crua", kcal: 113.9, p: 21.077, c: 0.0, g: 2.65, fiber: 0, group: "protein", cookFactor: 0.75 }, // TACO item 321
  { name: "Merluza, filé, cru", kcal: 89.131, p: 16.607, c: 0.0, g: 2.02, fiber: 0, group: "protein", cookFactor: 0.75 }, // TACO item 302
  { name: "Brócolis, cru", kcal: 25.495, p: 3.645, c: 4.025, g: 0.267, fiber: 2.88, group: "veg", cookFactor: 1 }, // TACO item 101
  { name: "Abobrinha, italiana, crua", kcal: 19.279, p: 1.141, c: 4.292, g: 0.14, fiber: 1.353, group: "veg", cookFactor: 1 }, // TACO item 71
  { name: "Cenoura, crua", kcal: 34.135, p: 1.322, c: 7.66, g: 0.173, fiber: 3.183, group: "veg", cookFactor: 1 }, // TACO item 110
  { name: "Tomate, com semente, cru", kcal: 15.335, p: 1.098, c: 3.139, g: 0.173, fiber: 1.173, group: "veg", cookFactor: 1 }, // TACO item 157
  { name: "Pepino, cru", kcal: 9.534, p: 0.87, c: 2.037, g: 0, fiber: 1.12, group: "veg", cookFactor: 1 }, // TACO item 142
  { name: "Alface, crespa, crua", kcal: 10.681, p: 1.348, c: 1.696, g: 0.16, fiber: 1.827, group: "veg", cookFactor: 1 }, // TACO item 78
  { name: "Alface, lisa, crua", kcal: 13.821, p: 1.688, c: 2.428, g: 0.123, fiber: 2.33, group: "veg", cookFactor: 1 }, // TACO item 79
  { name: "Espinafre, Nova Zelândia, cru", kcal: 16.096, p: 1.996, c: 2.574, g: 0.243, fiber: 2.1, group: "veg", cookFactor: 1 }, // TACO item 119
  { name: "Couve, manteiga, crua", kcal: 27.057, p: 2.873, c: 4.333, g: 0.547, fiber: 3.12, group: "veg", cookFactor: 1 }, // TACO item 115
  { name: "Couve-flor, crua", kcal: 22.563, p: 1.906, c: 4.518, g: 0.213, fiber: 2.35, group: "veg", cookFactor: 1 }, // TACO item 117
  { name: "Chuchu, cru", kcal: 16.979, p: 0.699, c: 4.137, g: 0.06, fiber: 1.28, group: "veg", cookFactor: 1 }, // TACO item 113
  { name: "Cebola, crua", kcal: 39.42, p: 1.71, c: 8.853, g: 0.08, fiber: 2.187, group: "veg", cookFactor: 1 }, // TACO item 107
  { name: "Berinjela, crua", kcal: 19.628, p: 1.221, c: 4.429, g: 0.1, fiber: 2.873, group: "veg", cookFactor: 1 }, // TACO item 96
  { name: "Beterraba, crua", kcal: 48.829, p: 1.946, c: 11.111, g: 0.09, fiber: 3.373, group: "veg", cookFactor: 1 }, // TACO item 98
  { name: "Repolho, branco, cru", kcal: 17.119, p: 0.877, c: 3.86, g: 0.143, fiber: 1.89, group: "veg", cookFactor: 1 }, // TACO item 149
  { name: "Agrião, cru", kcal: 16.579, p: 2.688, c: 2.252, g: 0.237, fiber: 2.137, group: "veg", cookFactor: 1 }, // TACO item 75
  { name: "Vagem, crua", kcal: 24.898, p: 1.786, c: 5.347, g: 0.173, fiber: 2.383, group: "veg", cookFactor: 1 }, // TACO item 162
  { name: "Pimentão, verde, cru", kcal: 21.286, p: 1.051, c: 4.893, g: 0.15, fiber: 2.563, group: "veg", cookFactor: 1 }, // TACO item 144
  { name: "Abóbora, cabotian, crua", kcal: 38.599, p: 1.746, c: 8.36, g: 0.537, fiber: 2.167, group: "veg", cookFactor: 1 }, // TACO item 65
  { name: "Banana, prata, crua", kcal: 98.25, p: 1.268, c: 25.957, g: 0.065, fiber: 2.043, group: "fruit", cookFactor: 1 }, // TACO item 182
  { name: "Banana, nanica, crua", kcal: 91.529, p: 1.399, c: 23.848, g: 0.117, fiber: 1.947, group: "fruit", cookFactor: 1 }, // TACO item 179
  { name: "Maçã, Fuji, com casca, crua", kcal: 55.515, p: 0.287, c: 15.153, g: 0, fiber: 1.347, group: "fruit", cookFactor: 1 }, // TACO item 222
  { name: "Mamão, Papaia, cru", kcal: 40.157, p: 0.456, c: 10.44, g: 0.124, fiber: 1.043, group: "fruit", cookFactor: 1 }, // TACO item 226
  { name: "Laranja, pêra, crua", kcal: 36.774, p: 1.043, c: 8.947, g: 0.127, fiber: 0.767, group: "fruit", cookFactor: 1 }, // TACO item 214
  { name: "Morango, cru", kcal: 30.148, p: 0.895, c: 6.818, g: 0.31, fiber: 1.723, group: "fruit", cookFactor: 1 }, // TACO item 239
  { name: "Manga, Tommy Atkins, crua", kcal: 50.692, p: 0.855, c: 12.772, g: 0.22, fiber: 2.067, group: "fruit", cookFactor: 1 }, // TACO item 231
  { name: "Melancia, crua", kcal: 32.607, p: 0.884, c: 8.139, g: 0, fiber: 0.123, group: "fruit", cookFactor: 1 }, // TACO item 235
  { name: "Uva, Itália, crua", kcal: 52.873, p: 0.746, c: 13.573, g: 0.203, fiber: 0.92, group: "fruit", cookFactor: 1 }, // TACO item 256
  { name: "Abacate, cru", kcal: 96.155, p: 1.239, c: 6.031, g: 8.397, fiber: 6.313, group: "fruit", cookFactor: 1 }, // TACO item 163
  { name: "Pêra, Williams, crua", kcal: 53.309, p: 0.565, c: 14.025, g: 0.11, fiber: 3.013, group: "fruit", cookFactor: 1 }, // TACO item 243
  { name: "Abacaxi, cru", kcal: 48.322, p: 0.859, c: 12.335, g: 0.123, fiber: 0.987, group: "fruit", cookFactor: 1 }, // TACO item 164
  { name: "Kiwi, cru", kcal: 51.136, p: 1.337, c: 11.5, g: 0.627, fiber: 2.653, group: "fruit", cookFactor: 1 }, // TACO item 207
  { name: "Goiaba, vermelha, com casca, crua", kcal: 54.17, p: 1.087, c: 13.01, g: 0.44, fiber: 6.223, group: "fruit", cookFactor: 1 }, // TACO item 200
  { name: "Tangerina, Poncã, crua", kcal: 37.831, p: 0.848, c: 9.61, g: 0.073, fiber: 0.94, group: "fruit", cookFactor: 1 }, // TACO item 251
  { name: "Queijo, minas, frescal", kcal: 264.273, p: 17.411, c: 3.24, g: 20.181, fiber: 0, group: "dairy", cookFactor: 1 }, // TACO item 461
  { name: "Iogurte, natural", kcal: 51.49, p: 4.063, c: 1.917, g: 3.04, fiber: 0, group: "dairy", cookFactor: 1 }, // TACO item 448
  { name: "Amendoim, torrado, salgado", kcal: 605.781, p: 22.475, c: 18.702, g: 53.963, fiber: 7.763, group: "fat", cookFactor: 1 }, // TACO item 558
  { name: "Castanha-de-caju, torrada, salgada", kcal: 570.168, p: 18.509, c: 29.135, g: 46.28, fiber: 3.663, group: "fat", cookFactor: 1 }, // TACO item 588
  { name: "Castanha-do-Brasil, crua", kcal: 642.963, p: 14.536, c: 15.079, g: 63.459, fiber: 7.931, group: "fat", cookFactor: 1 }, // TACO item 589
  { name: "Azeite, de oliva, extra virgem", kcal: 884.0, p: 0, c: 0, g: 100.0, fiber: 0, group: "fat", cookFactor: 1 }, // TACO item 260
  { name: "Óleo, de soja", kcal: 884.0, p: 0, c: 0, g: 100.0, fiber: 0, group: "fat", cookFactor: 1 }, // TACO item 272
  { name: "Carne, bovina, coxão mole, sem gordura, cru", kcal: 169.066, p: 21.23, c: 0, g: 8.693, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 352
  { name: "Carne, bovina, miolo de alcatra, sem gordura, cru", kcal: 162.871, p: 21.61, c: 0, g: 7.827, fiber: 0, group: "protein", cookFactor: 0.7 }, // TACO item 369
];
